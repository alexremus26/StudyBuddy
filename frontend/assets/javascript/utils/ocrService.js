import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.min.mjs';

GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let sharedWorker = null;
let sharedWorkerReady = null;

const OCR_WORKER_PARAMS = {
  tessedit_pageseg_mode: '11',
  preserve_interword_spaces: '1',
  user_defined_dpi: '300',
};

const OCR_RECOGNIZE_OPTIONS = {
  rotateAuto: true,
};

const OCR_OUTPUT_OPTIONS = {
  blocks: true,
  text: true,
  hocr: true,
  tsv: true,
};

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('OCR cancelled by user.');
    error.name = 'AbortError';
    throw error;
  }
}

function normalizeText(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readFileAsArrayBuffer(file) {
  return file.arrayBuffer();
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toPlainTextFromItems(items) {
  return items
    .map((item) => item?.str ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBoundingBox(bbox) {
  if (!bbox || typeof bbox !== 'object') {
    return null;
  }

  const x0 = numberOrNull(bbox.x0);
  const y0 = numberOrNull(bbox.y0);
  const x1 = numberOrNull(bbox.x1);
  const y1 = numberOrNull(bbox.y1);

  if ([x0, y0, x1, y1].some((value) => value == null)) {
    return null;
  }

  return {
    x0,
    y0,
    x1,
    y1,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0),
  };
}

function normalizeWord(word) {
  if (!word || typeof word !== 'object') {
    return null;
  }

  return {
    text: String(word.text || '').trim(),
    confidence: numberOrNull(word.confidence),
    bbox: normalizeBoundingBox(word.bbox),
    isNumeric: Boolean(word.is_numeric),
    inDictionary: Boolean(word.in_dictionary),
    language: word.language || '',
    direction: word.direction || '',
  };
}

function normalizeLine(line) {
  if (!line || typeof line !== 'object') {
    return null;
  }

  const words = Array.isArray(line.words)
    ? line.words.map(normalizeWord).filter(Boolean)
    : [];

  const text = normalizeText(
    String(line.text || words.map((word) => word.text).filter(Boolean).join(' '))
      .replace(/\s+/g, ' ')
      .trim(),
  );

  return {
    text,
    confidence: numberOrNull(line.confidence),
    bbox: normalizeBoundingBox(line.bbox),
    words,
  };
}

function normalizeParagraph(paragraph) {
  if (!paragraph || typeof paragraph !== 'object') {
    return null;
  }

  const lines = Array.isArray(paragraph.lines)
    ? paragraph.lines.map(normalizeLine).filter(Boolean)
    : [];

  const words = lines.flatMap((line) => line.words || []);

  return {
    text: normalizeText(String(paragraph.text || lines.map((line) => line.text).filter(Boolean).join('\n'))),
    confidence: numberOrNull(paragraph.confidence),
    bbox: normalizeBoundingBox(paragraph.bbox),
    lines,
    words,
  };
}

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') {
    return null;
  }

  const paragraphs = Array.isArray(block.paragraphs)
    ? block.paragraphs.map(normalizeParagraph).filter(Boolean)
    : [];
  const lines = paragraphs.flatMap((paragraph) => paragraph.lines || []);
  const words = paragraphs.flatMap((paragraph) => paragraph.words || []);

  return {
    text: normalizeText(String(block.text || lines.map((line) => line.text).filter(Boolean).join('\n'))),
    confidence: numberOrNull(block.confidence),
    bbox: normalizeBoundingBox(block.bbox),
    blocktype: block.blocktype || '',
    polygon: Array.isArray(block.polygon) ? block.polygon : [],
    paragraphs,
    lines,
    words,
  };
}

function buildLayoutAwareText(pageData) {
  const lines = Array.isArray(pageData?.lines)
    ? pageData.lines.map(normalizeLine).filter(Boolean)
    : [];

  const lineText = lines
    .map((line) => line.text)
    .filter(Boolean)
    .join('\n');

  const fallbackText = normalizeText(pageData?.text || '');
  return normalizeText(lineText || fallbackText);
}

function scoreOcrVariant(pageData) {
  const text = normalizeText(pageData?.text || '');
  const confidence = numberOrNull(pageData?.confidence) ?? 0;
  const lineCount = Array.isArray(pageData?.lines) ? pageData.lines.length : 0;
  const wordCount = Array.isArray(pageData?.words) ? pageData.words.length : 0;

  return (
    confidence * 4
    + Math.min(text.length, 3000) / 100
    + Math.min(lineCount, 200) * 0.5
    + Math.min(wordCount, 400) * 0.05
  );
}

function getCanvasContext(canvas) {
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to initialize OCR canvas context.');
  }
  return context;
}

async function loadRenderableSource(source) {
  if (source instanceof HTMLCanvasElement) {
    return {
      width: source.width,
      height: source.height,
      draw: (context) => {
        context.drawImage(source, 0, 0);
      },
      dispose: async () => {},
    };
  }

  if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    return {
      width: source.width,
      height: source.height,
      draw: (context) => {
        context.putImageData(source, 0, 0);
      },
      dispose: async () => {},
    };
  }

  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
      draw: (context) => {
        context.drawImage(source, 0, 0);
      },
      dispose: async () => {},
    };
  }

  if (typeof createImageBitmap === 'function') {
    const canUseBitmap = source instanceof Blob
      || source instanceof File
      || (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas);

    if (canUseBitmap) {
      try {
        const bitmap = await createImageBitmap(source);
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (context) => {
            context.drawImage(bitmap, 0, 0);
          },
          dispose: async () => {
            if (typeof bitmap.close === 'function') {
              bitmap.close();
            }
          },
        };
      } catch {
        // Fall back to the HTMLImageElement path below.
      }
    }
  }

  if (source instanceof Blob || source instanceof File) {
    const objectUrl = URL.createObjectURL(source);
    try {
      const image = await new Promise((resolve, reject) => {
        const loadedImage = new Image();
        loadedImage.onload = () => resolve(loadedImage);
        loadedImage.onerror = () => reject(new Error('Failed to load image for OCR preprocessing.'));
        loadedImage.src = objectUrl;
      });

      return {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        draw: (context) => {
          context.drawImage(image, 0, 0);
        },
        dispose: async () => {
          URL.revokeObjectURL(objectUrl);
        },
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  throw new Error('Unsupported image source for OCR preprocessing.');
}

function createPreparedCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function calculateUpscaleFactor(width, height) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= 0) {
    return 1;
  }

  const targetLongestEdge = 2200;
  return clamp(targetLongestEdge / longestEdge, 1, 2.5);
}

async function createOcrCanvasVariant(source, { enhance = false } = {}) {
  const renderable = await loadRenderableSource(source);
  const scaleFactor = enhance ? calculateUpscaleFactor(renderable.width, renderable.height) : 1;
  const canvas = createPreparedCanvas(renderable.width * scaleFactor, renderable.height * scaleFactor);
  const context = getCanvasContext(canvas);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (scaleFactor !== 1) {
    context.scale(scaleFactor, scaleFactor);
  }

  renderable.draw(context);

  if (enhance) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    let luminanceSum = 0;
    const pixelCount = data.length / 4;

    for (let index = 0; index < data.length; index += 4) {
      const gray = (0.2126 * data[index]) + (0.7152 * data[index + 1]) + (0.0722 * data[index + 2]);
      luminanceSum += gray;
    }

    const averageLuminance = pixelCount > 0 ? luminanceSum / pixelCount : 255;
    const threshold = clamp(Math.round(averageLuminance - 12), 120, 220);
    const contrast = 1.35;

    for (let index = 0; index < data.length; index += 4) {
      const gray = (0.2126 * data[index]) + (0.7152 * data[index + 1]) + (0.0722 * data[index + 2]);
      const contrasted = clamp(Math.round(((gray - 128) * contrast) + 128), 0, 255);
      const binary = contrasted >= threshold ? 255 : 0;
      data[index] = binary;
      data[index + 1] = binary;
      data[index + 2] = binary;
    }

    context.putImageData(imageData, 0, 0);
  }

  await renderable.dispose();
  return canvas;
}

async function recognizeCanvasVariant(canvas, variantName) {
  const worker = await getOcrWorker();
  const result = await worker.recognize(canvas, OCR_RECOGNIZE_OPTIONS, OCR_OUTPUT_OPTIONS);
  const pageData = result?.data || {};
  const structuredBlocks = Array.isArray(pageData.blocks)
    ? pageData.blocks.map(normalizeBlock).filter(Boolean)
    : [];
  const structuredLines = Array.isArray(pageData.lines)
    ? pageData.lines.map(normalizeLine).filter(Boolean)
    : [];
  const structuredWords = Array.isArray(pageData.words)
    ? pageData.words.map(normalizeWord).filter(Boolean)
    : [];
  const fullText = buildLayoutAwareText(pageData);

  return {
    variantName,
    fullText,
    averageConfidence: numberOrNull(pageData.confidence),
    pageData: {
      blocks: structuredBlocks,
      lines: structuredLines,
      words: structuredWords,
      hocr: pageData.hocr || null,
      tsv: pageData.tsv || null,
      rotateRadians: numberOrNull(pageData.rotateRadians),
      psm: pageData.psm || '',
      oem: pageData.oem || '',
      version: pageData.version || '',
    },
  };
}

async function runBestImageRecognition(source) {
  const variants = [
    { name: 'original', enhance: false },
    { name: 'enhanced', enhance: true },
  ];

  const results = [];
  for (const variant of variants) {
    const canvas = await createOcrCanvasVariant(source, { enhance: variant.enhance });
    const recognition = await recognizeCanvasVariant(canvas, variant.name);
    results.push(recognition);
  }

  const bestResult = results.reduce((best, current) => {
    if (!best) {
      return current;
    }

    return scoreOcrVariant(current.pageData) > scoreOcrVariant(best.pageData) ? current : best;
  }, null);

  const selectedResult = bestResult || results[0] || {
    variantName: 'original',
    fullText: '',
    averageConfidence: null,
    pageData: { blocks: [], lines: [], words: [] },
  };

  const warnings = [];
  if (!selectedResult.fullText) {
    warnings.push('OCR did not extract readable text from the image.');
  }

  if (results.length > 1 && selectedResult.variantName === 'enhanced') {
    warnings.push('Applied preprocessing and selected the enhanced OCR pass.');
  }

  return {
    fullText: selectedResult.fullText,
    pages: [
      {
        pageIndex: 1,
        source: selectedResult.variantName,
        text: selectedResult.fullText,
        confidence: selectedResult.averageConfidence,
        blocks: selectedResult.pageData.blocks,
        lines: selectedResult.pageData.lines,
        words: selectedResult.pageData.words,
      },
    ],
    averageConfidence: selectedResult.averageConfidence,
    warnings,
    diagnostics: {
      selected_variant: selectedResult.variantName,
      compared_variants: results.map((item) => ({
        variant: item.variantName,
        score: roundScore(scoreOcrVariant(item.pageData)),
        confidence: item.averageConfidence,
        text_length: item.fullText.length,
      })),
    },
  };
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

export async function getOcrWorker() {
  if (sharedWorker) {
    if (sharedWorkerReady) {
      await sharedWorkerReady;
    }
    return sharedWorker;
  }

  sharedWorker = await createWorker('eng');
  sharedWorkerReady = sharedWorker.setParameters(OCR_WORKER_PARAMS).catch(async (error) => {
    try {
      await sharedWorker?.terminate();
    } catch {
      // Best effort cleanup.
    }
    sharedWorker = null;
    sharedWorkerReady = null;
    throw error;
  });

  await sharedWorkerReady;
  return sharedWorker;
}

export async function terminateOcrWorker() {
  if (!sharedWorker) {
    return;
  }

  await sharedWorker.terminate();
  sharedWorker = null;
  sharedWorkerReady = null;
}

export async function runImageOcr(fileOrBlob, options = {}) {
  const { onProgress, signal } = options;
  throwIfAborted(signal);

  onProgress?.({ stage: 'ocr', current: 1, total: 2, message: 'Preprocessing image for OCR...' });
  const result = await runBestImageRecognition(fileOrBlob);
  throwIfAborted(signal);

  onProgress?.({
    stage: 'ocr',
    current: 2,
    total: 2,
    message: `Running OCR (${result.diagnostics.selected_variant})...`,
  });

  return result;
}

export async function extractPdfNativeText(file, options = {}) {
  const { onProgress, signal, maxPages = 15 } = options;
  throwIfAborted(signal);

  const warnings = [];
  const bytes = await readFileAsArrayBuffer(file);
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const pageLimit = Math.min(totalPages, maxPages);

  if (totalPages > maxPages) {
    warnings.push(`Only the first ${maxPages} pages were processed in this import.`);
  }

  const pages = [];

  for (let index = 1; index <= pageLimit; index += 1) {
    throwIfAborted(signal);

    onProgress?.({
      stage: 'native',
      current: index,
      total: pageLimit,
      message: `Extracting native text from page ${index}/${pageLimit}...`,
    });

    const page = await pdf.getPage(index);
    const textContent = await page.getTextContent();
    const text = normalizeText(toPlainTextFromItems(textContent.items));

    pages.push({
      pageIndex: index,
      text,
      charCount: text.length,
      source: 'native',
    });
  }

  return {
    pages,
    totalPages,
    processedPages: pageLimit,
    warnings,
  };
}

export async function pdfPagesToImagesForOcr(file, pageIndexes, options = {}) {
  const { signal, scale = 2 } = options;
  throwIfAborted(signal);

  const bytes = await readFileAsArrayBuffer(file);
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const images = [];

  for (let i = 0; i < pageIndexes.length; i += 1) {
    const pageIndex = pageIndexes[i];
    throwIfAborted(signal);

    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('Failed to initialize PDF canvas context.');
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((resultBlob) => {
        if (resultBlob) {
          resolve(resultBlob);
          return;
        }
        reject(new Error('Failed to convert PDF page to image blob.'));
      }, 'image/png');
    });

    images.push({ pageIndex, blob });
  }

  return images;
}

export async function runPdfHybridExtraction(file, callbacks = {}, options = {}) {
  const {
    signal,
    nativeTextThreshold = 50,
    maxPages = 15,
    scale = 2,
  } = options;

  const { onProgress } = callbacks;
  throwIfAborted(signal);

  const nativeResult = await extractPdfNativeText(file, {
    signal,
    onProgress,
    maxPages,
  });

  const fallbackPageIndexes = nativeResult.pages
    .filter((page) => page.charCount < nativeTextThreshold)
    .map((page) => page.pageIndex);

  const pagesByIndex = new Map(
    nativeResult.pages.map((page) => [
      page.pageIndex,
      {
        pageIndex: page.pageIndex,
        source: 'native',
        text: page.text,
        confidence: null,
      },
    ]),
  );

  const ocrWarnings = [];
  const ocrConfidences = [];

  if (fallbackPageIndexes.length > 0) {
    const images = await pdfPagesToImagesForOcr(file, fallbackPageIndexes, { signal, scale });

    for (let i = 0; i < images.length; i += 1) {
      throwIfAborted(signal);
      const image = images[i];

      onProgress?.({
        stage: 'ocr',
        current: i + 1,
        total: images.length,
        message: `Running OCR for fallback page ${i + 1}/${images.length}...`,
        pageIndex: image.pageIndex,
      });

      const pageResult = await runImageOcr(image.blob, { signal });
      const extracted = pageResult.pages[0];

      pagesByIndex.set(image.pageIndex, {
        pageIndex: image.pageIndex,
        source: extracted.source || 'ocr',
        text: extracted.text,
        confidence: extracted.confidence,
        blocks: extracted.blocks || [],
        lines: extracted.lines || [],
        words: extracted.words || [],
      });

      if (Number.isFinite(extracted.confidence)) {
        ocrConfidences.push(extracted.confidence);
      }

      if (!extracted.text) {
        ocrWarnings.push(`OCR returned empty text for page ${image.pageIndex}.`);
      }
    }
  }

  const orderedPages = Array.from(pagesByIndex.values()).sort((a, b) => a.pageIndex - b.pageIndex);
  const fullText = normalizeText(
    orderedPages
      .map((page) => page.text)
      .filter(Boolean)
      .join('\n\n'),
  );
  const averageConfidence = ocrConfidences.length
    ? ocrConfidences.reduce((sum, value) => sum + value, 0) / ocrConfidences.length
    : null;

  return {
    fullText,
    pages: orderedPages,
    averageConfidence,
    warnings: [...nativeResult.warnings, ...ocrWarnings],
  };
}

export async function runDocumentOcr(file, callbacks = {}, options = {}) {
  if (!(file instanceof File)) {
    throw new Error('Please select a valid file.');
  }

  const mimeType = file.type?.toLowerCase() ?? '';
  const filename = file.name?.toLowerCase() ?? '';
  const isPdf = mimeType === 'application/pdf' || filename.endsWith('.pdf');
  const isImage = ['image/png', 'image/jpeg', 'image/jpg'].includes(mimeType);

  if (isImage) {
    return runImageOcr(file, {
      signal: options.signal,
      onProgress: callbacks.onProgress,
    });
  }

  if (isPdf) {
    return runPdfHybridExtraction(file, callbacks, options);
  }

  throw new Error('Unsupported file type. Please use PNG, JPG, or PDF.');
}
