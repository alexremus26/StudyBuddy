import json
import re

from openai import OpenAI

from django.conf import settings


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

CLASS_HINT_PATTERN = re.compile(r"\((?:curs|course|lab|seminar|seminar|workshop|tutorial)\)", re.I)


def _normalize_day(value):
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
    cleaned = (content or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _load_json_object(content):
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


def _extract_blocks_from_regex(text):
    blocks = []
    day_pattern = re.compile(
        r"\b(monday|mon|lu|luni|tuesday|tue|tues|ma|marti|marți|wednesday|wed|mi|miercuri|thursday|thu|jo|joi|friday|fri|vi|vineri|saturday|sat|sa|sâ|sambata|sâmbătă|sunday|sun|du|duminica|duminică)\b",
        re.I,
    )
    line_patterns = [
        re.compile(r"^(?P<day>[^\d]{2,20})\s+(?P<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?P<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?P<title>.*)$", re.I),
        re.compile(r"^(?P<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?P<end>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:[-:|]\s*)?(?P<title>.*)$", re.I),
        re.compile(r"^(?P<title>.*?)(?:[-:|]\s*)?(?P<start>\d{1,4}(?:[:.,]\d{1,2})?)\s*(?:-|to|–|—)\s*(?P<end>\d{1,4}(?:[:.,]\d{1,2})?)$", re.I),
    ]

    current_day = None
    for raw_line in str(text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        day_match = day_pattern.search(line)
        if day_match:
            current_day = _normalize_day(day_match.group(1))

        if day_pattern.search(line) and not re.search(r"(\d{1,2}[:.,]\d{1,2}|\d{3,4})", line):
            continue

        for pattern in line_patterns:
            match = pattern.match(line)
            if not match:
                continue

            groups = match.groupdict()
            day = _normalize_day(groups.get("day")) if groups.get("day") else current_day
            start = _parse_time(groups.get("start"))
            end = _parse_time(groups.get("end"))
            title = (groups.get("title") or "").strip() or "Imported schedule block"
            if day is None or not start or not end:
                continue

            blocks.append(
                {
                    "day_of_week": day,
                    "start_time": start,
                    "end_time": end,
                    "title": title,
                    "confidence": 0.5,
                    "raw_text": line,
                }
            )
            break

    return blocks


def _extract_time_intervals(text):
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


def _build_llm_input(raw_text, max_chars=4500):
    lines = [line.strip() for line in str(raw_text or "").splitlines() if line.strip()]
    if not lines:
        return ""

    focused = []
    for line in lines:
        lower = line.lower()
        has_day = _normalize_day(lower) is not None
        has_time = bool(INTERVAL_PATTERN.search(line))
        has_class_hint = bool(CLASS_HINT_PATTERN.search(line))
        has_alpha = bool(re.search(r"[A-Za-z]", line))

        if has_day or has_time or has_class_hint:
            focused.append(line)
            continue

        # Keep short alphabetic lines as potential title/location rows in table OCR.
        if has_alpha and 2 <= len(line) <= 60:
            focused.append(line)

    selected = focused if focused else lines[:120]
    compact = "\n".join(selected)
    return compact[:max_chars]


def _build_retry_llm_input(raw_text, max_chars=1400):
    lines = [line.strip() for line in str(raw_text or "").splitlines() if line.strip()]
    if not lines:
        return ""

    picked = []
    for index, line in enumerate(lines):
        has_day = _normalize_day(line.lower()) is not None
        has_time = bool(INTERVAL_PATTERN.search(line))
        has_class_hint = bool(CLASS_HINT_PATTERN.search(line))

        if has_day or has_time or has_class_hint:
            picked.append(line)
            # Preserve a likely continuation line (title/location) after day-only rows.
            if has_day and index + 1 < len(lines):
                picked.append(lines[index + 1])

    compact = "\n".join(dict.fromkeys(picked))
    return compact[:max_chars]


def _is_table_header_line(line):
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


def _extract_blocks_from_table_like_ocr(text):
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    intervals = _extract_time_intervals(text)
    if not lines or not intervals:
        return []

    blocks = []
    current_day = None
    interval_index = 0

    for line in lines:
        day = _normalize_day(line)
        if day is not None:
            current_day = day
            continue

        if _is_table_header_line(line):
            continue

        if current_day is None:
            continue

        if not re.search(r"[A-Za-z]", line):
            continue

        start, end = intervals[min(interval_index, len(intervals) - 1)]
        blocks.append(
            {
                "day_of_week": current_day,
                "start_time": start,
                "end_time": end,
                "title": line,
                "confidence": 0.45,
                "raw_text": line,
            }
        )
        interval_index += 1

    return blocks


def _clean_title_for_layout(line):
    cleaned = DAY_INLINE_PATTERN.sub("", str(line or ""))
    cleaned = INTERVAL_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"\s*[|•·]+\s*", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:|\t")
    return cleaned.strip() or "Imported schedule block"


def _extract_blocks_from_layout_hybrid_ocr(text):
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
                    "confidence": 0.62,
                    "raw_text": normalized,
                    "extraction_method": "layout_hybrid_interval_line",
                }
            )
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
                "confidence": 0.57,
                "raw_text": normalized,
                "extraction_method": "layout_hybrid_table",
            }
        )

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


class OllamaScheduleParser:
    def __init__(self):
        self.client = OpenAI(
            base_url=settings.OLLAMA_BASE_URL,
            api_key="ollama",
            timeout=settings.OLLAMA_REQUEST_TIMEOUT_SECONDS,
            max_retries=0,
        )
        self.model = (settings.OLLAMA_MODEL or "").strip()
        if not self.model:
            candidates = getattr(settings, "OLLAMA_MODEL_CANDIDATES", []) or []
            self.model = str(candidates[0]).strip() if candidates else ""

    def parse(self, raw_text, max_blocks=25, parser_mode="auto", layout_pipeline_mode="disabled"):
        parser_mode = str(parser_mode or "auto").strip().lower()
        if parser_mode not in {"auto", "ollama", "regex", "layout_hybrid"}:
            parser_mode = "auto"

        layout_pipeline_mode = str(layout_pipeline_mode or "disabled").strip().lower()
        if layout_pipeline_mode not in {"disabled", "shadow", "active"}:
            layout_pipeline_mode = "disabled"

        diagnostics = {
            "requested_parser_mode": parser_mode,
            "effective_parser_mode": parser_mode,
            "layout_pipeline_mode": layout_pipeline_mode,
            "layout_pipeline_enabled": layout_pipeline_mode in {"shadow", "active"},
            "fallback_used": False,
            "fallback_source": "",
            "extraction_method": "",
            "llm_input_compacted": False,
            "failure_type": "",
        }

        warnings = []
        llm_input = _build_llm_input(raw_text)
        model_output = ""
        failure_type = ""

        if parser_mode == "layout_hybrid":
            diagnostics["effective_parser_mode"] = "layout_hybrid"
            blocks = _extract_blocks_from_layout_hybrid_ocr(raw_text)
            extraction_method = "layout_hybrid"

            if not blocks:
                blocks = _extract_blocks_from_regex(raw_text)
                if blocks:
                    warnings.append("Layout-hybrid extraction was empty; regex fallback used.")
                    diagnostics["fallback_used"] = True
                    diagnostics["fallback_source"] = "regex"
                    extraction_method = "regex"

            if not blocks:
                blocks = _extract_blocks_from_table_like_ocr(raw_text)
                if blocks:
                    warnings.append("Layout-hybrid extraction was empty; table-like fallback used.")
                    diagnostics["fallback_used"] = True
                    diagnostics["fallback_source"] = "table_like_ocr"
                    extraction_method = "table_like_ocr"

            diagnostics["extraction_method"] = extraction_method
            return {
                "blocks": blocks[:max_blocks],
                "warnings": warnings,
                "source": "layout_hybrid",
                "model_output": "",
                "diagnostics": diagnostics,
            }

        if not self.model and parser_mode in {"auto", "ollama"}:
            warnings.append("No OLLAMA_MODEL configured; using regex fallback.")
            if parser_mode == "ollama":
                return {
                    "blocks": [],
                    "warnings": warnings,
                    "source": "ollama",
                    "model_output": "No model configured. Set OLLAMA_MODEL or OLLAMA_MODEL_CANDIDATES.",
                    "diagnostics": diagnostics,
                }
            parser_mode = "regex"
            diagnostics["effective_parser_mode"] = parser_mode

        if parser_mode == "regex":
            extraction_method = "regex"
            blocks = _extract_blocks_from_regex(raw_text)
            if not blocks:
                blocks = _extract_blocks_from_table_like_ocr(raw_text)
                if blocks:
                    warnings.append("Table-like OCR fallback used because line-based parsing was empty.")
                    extraction_method = "table_like_ocr"
                    diagnostics["fallback_used"] = True
                    diagnostics["fallback_source"] = extraction_method
            else:
                warnings.append("Regex parser mode was selected.")

            diagnostics["extraction_method"] = extraction_method

            return {
                "blocks": blocks[:max_blocks],
                "warnings": warnings,
                "source": "regex",
                "model_output": "",
                "diagnostics": diagnostics,
            }
        prompt = (
            "You extract school schedule blocks from OCR text. "
            "Return JSON only with this schema: {\"blocks\":[{\"day_of_week\":0-6,\"start_time\":\"HH:MM\",\"end_time\":\"HH:MM\",\"title\":\"string\",\"confidence\":0.0-1.0,\"raw_text\":\"string\"}],\"warnings\":[\"string\"]}. "
            "Use Monday=0 through Sunday=6. Accept English and Romanian day names. "
            "Do not invent missing times or days. Prefer one block per line."
        )

        payload = None

        def request_payload(input_text, token_budget):
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=0,
                max_tokens=token_budget,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": input_text},
                ],
            )
            content = response.choices[0].message.content if response.choices else ""
            return _load_json_object(content), content

        try:
            payload, model_output = request_payload(llm_input, 500)
        except BaseException as exc:
            failure_type = exc.__class__.__name__
            diagnostics["failure_type"] = failure_type
            if exc.__class__.__name__ == "APITimeoutError":
                retry_input = _build_retry_llm_input(raw_text)
                if retry_input:
                    warnings.append("Ollama timed out; retrying with compact prompt.")
                    try:
                        payload, retry_output = request_payload(retry_input, 220)
                        if retry_output:
                            model_output = retry_output
                    except BaseException as retry_exc:
                        failure_type = retry_exc.__class__.__name__
                        diagnostics["failure_type"] = failure_type
                        warnings.append(f"Ollama parse failed: {retry_exc.__class__.__name__}")
                else:
                    warnings.append(f"Ollama parse failed: {exc.__class__.__name__}")
            else:
                warnings.append(f"Ollama parse failed: {exc.__class__.__name__}")

        if llm_input and len(llm_input) < len(str(raw_text or "")):
            warnings.append("LLM input was compacted from OCR text to reduce timeout risk.")
            diagnostics["llm_input_compacted"] = True

        blocks = []
        extraction_method = "ollama"
        if isinstance(payload, dict):
            extra_warnings = payload.get("warnings", [])
            if isinstance(extra_warnings, list):
                warnings.extend(str(item) for item in extra_warnings if item)

            for block in payload.get("blocks", [])[:max_blocks]:
                if not isinstance(block, dict):
                    continue
                day = _normalize_day(block.get("day_of_week", block.get("day")))
                start = _parse_time(block.get("start_time"))
                end = _parse_time(block.get("end_time"))
                title = str(block.get("title", "")).strip() or "Imported schedule block"
                if day is None or not start or not end:
                    continue
                blocks.append(
                    {
                        "day_of_week": day,
                        "start_time": start,
                        "end_time": end,
                        "title": title,
                        "confidence": float(block.get("confidence", 0.5) or 0.5),
                        "raw_text": str(block.get("raw_text", "")).strip(),
                    }
                )

        if not blocks and parser_mode == "auto":
            blocks = _extract_blocks_from_regex(raw_text)
            if blocks:
                warnings.append("Fallback regex parser used because model output was empty or invalid.")
                extraction_method = "regex"
                diagnostics["fallback_used"] = True
                diagnostics["fallback_source"] = extraction_method

        if not blocks and parser_mode == "auto":
            blocks = _extract_blocks_from_table_like_ocr(raw_text)
            if blocks:
                warnings.append("Table-like OCR fallback used because line-based parsing was empty.")
                extraction_method = "table_like_ocr"
                diagnostics["fallback_used"] = True
                diagnostics["fallback_source"] = extraction_method

        if not blocks and parser_mode == "ollama":
            warnings.append("Ollama-only mode was selected; regex fallback is disabled.")

        if not model_output:
            preview = (llm_input or "").strip()
            if len(preview) > 1200:
                preview = preview[:1200] + "\n... [truncated]"
            model_output = (
                "No raw text response captured from Ollama.\n"
                f"Failure type: {failure_type or 'none'}\n"
                f"Parser mode: {parser_mode}\n"
                "Prompt input preview:\n"
                f"{preview}"
            )

        diagnostics["extraction_method"] = extraction_method

        return {
            "blocks": blocks[:max_blocks],
            "warnings": warnings,
            "source": "ollama" if parser_mode != "regex" else "regex",
            "model_output": (model_output or "")[:4000],
            "diagnostics": diagnostics,
        }
