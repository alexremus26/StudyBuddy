import json
import re
import logging

from django.conf import settings

try:
    import google.generativeai as genai
except Exception:
    genai = None

logger = logging.getLogger(__name__)

DAY_ALIASES = {
    "monday": 0,
    "mon": 0,
    "lu": 0,
    "luni": 0,
    "tuesday": 1,
    "tue": 1,
    "tues": 1,
    "ma": 1,
    "marti": 1,
    "marți": 1,
    "wednesday": 2,
    "wed": 2,
    "mi": 2,
    "miercuri": 2,
    "thursday": 3,
    "thu": 3,
    "jo": 3,
    "joi": 3,
    "friday": 4,
    "fri": 4,
    "vi": 4,
    "vineri": 4,
    "saturday": 5,
    "sat": 5,
    "sa": 5,
    "sâ": 5,
    "sambata": 5,
    "sâmbătă": 5,
    "sunday": 6,
    "sun": 6,
    "du": 6,
    "duminica": 6,
    "duminică": 6,
}

DAY_TOKEN_PATTERN = re.compile(
    r"^(monday|mon|lu|luni|tuesday|tue|tues|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)$",
    re.I,
)

DAY_INLINE_PATTERN = re.compile(
    r"\b(monday|mon|lu|luni|tuesday|tue|tues|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)\b",
    re.I,
)

INTERVAL_PATTERN = re.compile(
    r"(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})\s*(?:-|to|–|—)\s*(?:\d{1,2}[:.,]\d{1,2}|\d{3,4})",
    re.I,
)


def _normalize_day(value):
    """Convert day string/int to 0-6 integer."""
    if value is None:
        return None

    if isinstance(value, int):
        return value if 0 <= value <= 6 else None

    day_name = str(value).strip().lower()
    if day_name.isdigit():
        day_number = int(day_name)
        return day_number if 0 <= day_number <= 6 else None

    return DAY_ALIASES.get(day_name)


def _clean_json_text(content):
    """Remove markdown code fence formatting from JSON text."""
    cleaned = (content or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _load_json_object(content):
    """Safely load JSON object from potentially malformed text."""
    cleaned = _clean_json_text(content)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _parse_time(value):
    """Normalize and validate time string to HH:MM format."""
    normalized = str(value).strip().replace("O", "0").replace("o", "0").replace(".", ":").replace(",", ":")
    match = re.match(r"^(\d{1,2}):(\d{1,2})$", normalized)
    if not match:
        compact = re.match(r"^(\d{3,4})$", normalized)
        if not compact:
            return None
        raw = compact.group(1)
        if len(raw) == 3:
            hour = int(raw[0])
            minute = int(raw[1:])
        else:
            hour = int(raw[:2])
            minute = int(raw[2:])
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return None
        return f"{hour:02d}:{minute:02d}"
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _extract_time_intervals(text):
    """Extract all time intervals from text as list of (start, end) tuples."""
    intervals = []
    for match in INTERVAL_PATTERN.finditer(str(text or "")):
        pieces = re.split(r"\s*(?:-|to|–|—)\s*", match.group(0))
        if len(pieces) != 2:
            continue
        start = _parse_time(pieces[0])
        end = _parse_time(pieces[1])
        if start and end:
            intervals.append((start, end))
    return intervals


def _is_table_header_line(line):
    """Detect if a line is a table header and should be skipped."""
    lowered = line.strip().lower()
    if not lowered:
        return True
    if lowered.startswith("orar generat"):
        return True
    if "universitatea" in lowered or "facultatea" in lowered:
        return True
    if lowered.startswith("cti ") or lowered.startswith("grupa "):
        return True
    if re.fullmatch(r"[\d\s]+", lowered):
        return True
    if INTERVAL_PATTERN.fullmatch(lowered):
        return True
    return False


def _clean_title_for_layout(line):
    """Remove day names, intervals, and separators from class title."""
    cleaned = DAY_INLINE_PATTERN.sub("", str(line or ""))
    cleaned = INTERVAL_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"\s*[|•·]+\s*", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:|\t")
    return cleaned.strip() or "Imported schedule block"


def _compute_block_confidence(block):
    """Compute a heuristic confidence (0.0-1.0) for a parsed block.

    Factors considered:
    - time completeness (start+end > start only > none)
    - day plausibility (weekdays favored, weekends penalized)
    - title presence/length
    - extraction method (table results slightly penalized)
    - extra penalty when start exists but end is missing and title looks like a subject
    """
    day = block.get("day_of_week")
    start = block.get("start_time")
    end = block.get("end_time")
    title = str(block.get("title", "") or "").strip()
    method = str(block.get("extraction_method", "")).lower()

    # Time score: full interval > start only > none
    if start and end:
        time_score = 1.0
    elif start and not end:
        time_score = 0.5
    else:
        time_score = 0.0

    # Day score: penalize weekends (Saturday=5, Sunday=6)
    if isinstance(day, int):
        day_score = 0.0 if day in (5, 6) else 1.0
    else:
        day_score = 0.5

    # Title score: presence of letters and reasonable length
    title_has_letters = bool(re.search(r"[A-Za-z\u00C0-\u017F]", title))
    title_len = len(title)
    title_score = (min(title_len, 20) / 20.0) if title_has_letters else 0.0

    # Weighted combination
    raw_score = 0.6 * time_score + 0.25 * day_score + 0.15 * title_score

    # Slight penalty for table-based extraction which is more error-prone here
    if "table" in method:
        # Table-assigned blocks are much more likely to be misaligned; penalize more
        raw_score *= 0.65

    # Extra penalty when start exists but end missing and title looks like a subject
    # (these often indicate fragmented table rows or OCR line-break issues)
    if start and not end and title_has_letters:
        raw_score *= 0.6

    # Clamp and return rounded
    return round(max(0.0, min(1.0, raw_score)), 4)

def _extract_blocks_from_layout_hybrid_ocr(text):
    """
    Extract schedule blocks using hybrid layout analysis.
    Combines direct line matching with interval-based table fallback.
    """
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    if not lines:
        return []

    global_intervals = _extract_time_intervals(text)
    per_day_interval_index = {day: 0 for day in range(7)}
    blocks = []
    current_day = None

    line_patterns = [
        re.compile(r"^(?P<day>[^\d]{2,20})\s+(?P<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?P<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?P<title>.*)$", re.I),
        re.compile(r"^(?P<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?P<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?P<title>.*)$", re.I),
    ]

    for line in lines:
        normalized = line.strip()
        lowered = normalized.lower()
        if DAY_TOKEN_PATTERN.fullmatch(lowered):
            current_day = _normalize_day(lowered)
            continue

        explicit_day_match = DAY_INLINE_PATTERN.search(lowered)
        explicit_day = _normalize_day(explicit_day_match.group(0)) if explicit_day_match else None

        matched_direct = False
        for pattern in line_patterns:
            match = pattern.match(normalized)
            if not match:
                continue
            groups = match.groupdict()
            day = _normalize_day(groups.get("day")) if groups.get("day") else None
            day = explicit_day if explicit_day is not None else day
            day = current_day if day is None else day

            start = _parse_time(groups.get("start"))
            end = _parse_time(groups.get("end"))
            if day is None or not start or not end:
                continue

            title = _clean_title_for_layout(groups.get("title") or normalized)
            blocks.append(
                {
                    "day_of_week": day,
                    "start_time": start,
                    "end_time": end,
                    "title": title,
                    "raw_text": normalized,
                    "extraction_method": "layout_hybrid_interval_line",
                }
            )
            # compute and attach heuristic confidence
            blocks[-1]["confidence"] = _compute_block_confidence(blocks[-1])
            matched_direct = True
            break

        if matched_direct:
            continue

        if _is_table_header_line(normalized):
            continue

        day = explicit_day if explicit_day is not None else current_day
        if day is None:
            continue
        if not re.search(r"[A-Za-z]", normalized):
            continue

        if global_intervals:
            idx = per_day_interval_index.get(day, 0)
            start, end = global_intervals[min(idx, len(global_intervals) - 1)]
            per_day_interval_index[day] = idx + 1
        else:
            continue

        blocks.append(
            {
                "day_of_week": day,
                "start_time": start,
                "end_time": end,
                "title": _clean_title_for_layout(normalized),
                "raw_text": normalized,
                "extraction_method": "layout_hybrid_table",
            }
        )
        # compute and attach heuristic confidence for table blocks
        blocks[-1]["confidence"] = _compute_block_confidence(blocks[-1])

    deduped = []
    seen = set()
    for block in blocks:
        key = (
            block.get("day_of_week"),
            block.get("start_time"),
            block.get("end_time"),
            str(block.get("title", "")).strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(block)
    return deduped


class ScheduleParser:
    """
    Schedule parser that uses Hybrid OCR as primary extraction method,
    with automatic escalation to Gemini Vision API for low-confidence results.
    
    Workflow:
    1. Extract using Hybrid OCR (free, local, fast)
    2. If confidence < 0.7 or no blocks extracted, escalate to Gemini Vision
    3. If Gemini fails, fallback to Hybrid result
    """
    
    def __init__(self):
        """Initialize parser with Gemini API key from Django settings."""
        self.gemini_api_key = getattr(settings, "GEMINI_API_KEY", "").strip()
        self.gemini_model = settings.GEMINI_MODEL
        self.confidence_threshold = getattr(settings, "GEMINI_ESCALATION_CONFIDENCE_THRESHOLD", 0.62)
        self.min_blocks_for_hybrid_accept = max(
            int(getattr(settings, "GEMINI_ESCALATION_MIN_BLOCKS", 4) or 4),
            1,
        )
        
        if self.gemini_api_key and genai is not None:
            genai.configure(api_key=self.gemini_api_key)
    
    def parse(self, raw_text, max_blocks=25, layout_pipeline_mode="disabled"):
        """
        Parse schedule from OCR text using hybrid extraction + Gemini escalation.
        
        Args:
            raw_text: OCR'd text from PDF or image
            max_blocks: Maximum number of blocks to return
            layout_pipeline_mode: "disabled", "shadow", "active" (for diagnostics only)
            
        Returns:
            Dict with keys: blocks, warnings, source, model_output, diagnostics
        """
        layout_pipeline_mode = str(layout_pipeline_mode or "disabled").strip().lower()
        if layout_pipeline_mode not in {"disabled", "shadow", "active"}:
            layout_pipeline_mode = "disabled"
        
        diagnostics = {
            "extraction_method": "",
            "escalation_reason": "",
            "escalation_used": False,
            "escalation_method": "",
            "failure_type": "",
            "hybrid_avg_confidence": 0.0,
            "hybrid_block_count": 0,
            "hybrid_table_ratio": 0.0,
            "confidence_threshold": self.confidence_threshold,
            "layout_pipeline_mode": layout_pipeline_mode,
            "layout_pipeline_enabled": layout_pipeline_mode in {"shadow", "active"},
        }
        
        warnings = []
        model_output = ""
        
        # Step 1: Try Hybrid OCR extraction
        hybrid_blocks = _extract_blocks_from_layout_hybrid_ocr(raw_text)
        
        # Step 2: Check if escalation to Gemini is needed
        needs_escalation = False
        escalation_reason = ""
        
        if not hybrid_blocks:
            needs_escalation = True
            escalation_reason = "empty_hybrid_blocks"
            warnings.append("Hybrid OCR returned no blocks; escalating to Gemini Vision...")
        else:
            # Escalate on low confidence when result is sparse or table-heavy.
            avg_confidence = sum(b.get("confidence", 0.5) for b in hybrid_blocks) / len(hybrid_blocks)
            extracted_blocks = len(hybrid_blocks)
            table_blocks = sum(
                1
                for block in hybrid_blocks
                if str(block.get("extraction_method", "")).strip().lower() == "layout_hybrid_table"
            )
            table_ratio = table_blocks / extracted_blocks if extracted_blocks else 0.0

            diagnostics["hybrid_avg_confidence"] = round(avg_confidence, 4)
            diagnostics["hybrid_block_count"] = extracted_blocks
            diagnostics["hybrid_table_ratio"] = round(table_ratio, 4)

            is_sparse_result = extracted_blocks < self.min_blocks_for_hybrid_accept
            # Consider layouts table-heavy at a lower threshold so we escalate earlier
            is_table_heavy = table_ratio >= 0.3
            if is_table_heavy:
                needs_escalation = True
                escalation_reason = "table_heavy_layout"
                warnings.append(
                    f"Hybrid OCR table-heavy layout (ratio {table_ratio:.2f}); escalating to Gemini Vision..."
                )
            elif avg_confidence < self.confidence_threshold and (is_sparse_result or is_table_heavy):
                needs_escalation = True
                escalation_reason = "low_hybrid_confidence_sparse_or_table_heavy"
                reason_note = "sparse result" if is_sparse_result else "table-heavy result"
                warnings.append(
                    f"Hybrid OCR confidence {avg_confidence:.2f} below threshold {self.confidence_threshold} ({reason_note}); escalating to Gemini Vision..."
                )
        
        # Step 3: Call Gemini if escalation needed
        if needs_escalation and self.gemini_api_key:
            diagnostics["escalation_used"] = True
            diagnostics["escalation_reason"] = escalation_reason
            gemini_blocks, gemini_warnings, gemini_output, gemini_failure_type = self._parse_with_gemini_vision(raw_text, max_blocks)

            if gemini_blocks:
                # Gemini succeeded; use its result
                diagnostics["escalation_method"] = "gemini_vision"
                diagnostics["extraction_method"] = "gemini_vision"
                warnings.extend(gemini_warnings)
                model_output = gemini_output
                return {
                    "blocks": gemini_blocks[:max_blocks],
                    "warnings": warnings,
                    "source": "gemini_vision",
                    "model_output": model_output,
                    "diagnostics": diagnostics,
                }
            else:
                # Gemini failed; fallback to Hybrid
                if gemini_warnings:
                    warnings.extend(gemini_warnings)
                if gemini_failure_type == "ResourceExhausted":
                    warnings.append("Gemini quota is currently exhausted; using Hybrid OCR fallback.")
                else:
                    warnings.append("Gemini extraction failed; using Hybrid OCR as fallback.")
                diagnostics["escalation_method"] = "gemini_vision_failed"
                diagnostics["failure_type"] = gemini_failure_type or ""
                logger.warning(f"Gemini Vision extraction failed; falling back to Hybrid. Warnings: {gemini_warnings}")
        elif needs_escalation and not self.gemini_api_key:
            # Escalation needed but Gemini disabled
            warnings.append("Hybrid confidence low but GEMINI_API_KEY not configured; using Hybrid OCR.")
            logger.info(f"Escalation needed (reason: {escalation_reason}) but Gemini disabled; using Hybrid.")
        
        # Return Hybrid result (either as primary or fallback)
        diagnostics["extraction_method"] = "layout_hybrid"
        
        return {
            "blocks": hybrid_blocks[:max_blocks],
            "warnings": warnings,
            "source": "layout_hybrid",
            "model_output": model_output,
            "diagnostics": diagnostics,
        }
    
    def _parse_with_gemini_vision(self, raw_text, max_blocks=25):
        """
        Use Gemini Vision to extract schedule from OCR text.
        
        Returns:
            Tuple: (blocks list, warnings list, model_output string, failure_type string)
        """
        warnings = []
        model_output = ""
        blocks = []
        failure_type = ""
        
        try:
            prompt = (
                "Extract the school schedule from this OCR text into a structured JSON format. "
                "Return ONLY valid JSON with this exact schema:\n"
                '{"blocks": [{"day_of_week": 0-6, "start_time": "HH:MM", "end_time": "HH:MM", "title": "string"}], '
                '"warnings": ["string"]}\n\n'
                "Rules:\n"
                "- day_of_week: Monday=0, Tuesday=1, ..., Sunday=6\n"
                "- Accept English and Romanian day names\n"
                "- time format: HH:MM (24-hour)\n"
                "- If a cell is empty, skip it\n"
                "- Do not invent missing times or days\n"
                "- Maintain grid logic precisely\n"
                "- One block per schedule entry\n"
                "- If you can identify subject, instructor(s), and location, format title EXACTLY as: \"Subject | Instructor | Location\"\n"
                "- Use a single pipe separator with spaces: \" | \" (do not use slashes or commas as separators)\n"
                "- If multiple instructors appear, join them with \", \": \"Instructor A, Instructor B\"\n"
                "- If only some parts are available, keep the order and omit missing parts (e.g. \"Subject | Instructor\" or \"Subject | Location\")\n"
                "- Strip labels like \"Location:\", \"Prof.\", \"Lect.\", \"Instructor\" from parts\n"
                "- Do NOT include class type (Course/Lab/Seminar) inside the title\n\n"
                "OCR Text:\n" + str(raw_text)[:5000]
            )
            
            client = genai.GenerativeModel(self.gemini_model)
            
            try:
                response = client.generate_content(prompt)
            except Exception as exc:
                failure_type = exc.__class__.__name__
                warnings.append(f"Gemini Vision API failed: {failure_type}")
                logger.error(f"Gemini Vision extraction failed: {exc}", exc_info=True)
                return [], warnings, model_output, failure_type
            
            if not response or not response.text:
                warnings.append("Gemini returned empty response")
                return [], warnings, model_output, failure_type
            
            model_output = response.text
            
            # Parse JSON from response
            payload = _load_json_object(response.text)
            if not isinstance(payload, dict):
                warnings.append(f"Gemini response was not valid JSON: {response.text[:200]}")
                return [], warnings, model_output, failure_type
            
            # Extract blocks from Gemini response
            for block in payload.get("blocks", [])[:max_blocks]:
                if not isinstance(block, dict):
                    continue
                
                day = _normalize_day(block.get("day_of_week", block.get("day")))
                start = _parse_time(block.get("start_time"))
                end = _parse_time(block.get("end_time"))
                title = str(block.get("title", "")).strip() or "Imported schedule block"
                
                if day is None or not start or not end:
                    continue
                
                blocks.append({
                    "day_of_week": day,
                    "start_time": start,
                    "end_time": end,
                    "title": title,
                    "raw_text": "",
                    "extraction_method": "gemini_vision",
                })
                # compute confidence for Gemini blocks and ensure a reasonable baseline
                # avoid inflating Gemini answers too high; keep baseline modest
                blocks[-1]["confidence"] = max(_compute_block_confidence(blocks[-1]), 0.6)
            
            # Include Gemini's own warnings
            gemini_warnings = payload.get("warnings", [])
            if isinstance(gemini_warnings, list):
                warnings.extend(str(w) for w in gemini_warnings if w)
            
            logger.info(f"Gemini Vision extracted {len(blocks)} blocks")
            
        except Exception as exc:
            failure_type = exc.__class__.__name__
            warnings.append(f"Gemini Vision API failed: {failure_type}")
            logger.error(f"Gemini Vision extraction failed: {exc}", exc_info=True)
        
        return blocks, warnings, model_output, failure_type
