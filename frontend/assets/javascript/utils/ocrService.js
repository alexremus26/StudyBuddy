import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.min.mjs';

GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let sharedWorker = null;

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

function toPlainTextFromItems(items) {
  return items
    .map((item) => item?.str ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getOcrWorker() {
  if (sharedWorker) {
    return sharedWorker;
  }

  sharedWorker = await createWorker('eng');
  return sharedWorker;
}

export async function terminateOcrWorker() {
  if (!sharedWorker) {
    return;
  }

  await sharedWorker.terminate();
  sharedWorker = null;
}

export async function runImageOcr(fileOrBlob, options = {}) {
  const { onProgress, signal } = options;
  throwIfAborted(signal);

  const worker = await getOcrWorker();
  onProgress?.({ stage: 'ocr', current: 1, total: 1, message: 'Running image OCR...' });

  const result = await worker.recognize(fileOrBlob);
  throwIfAborted(signal);

  const text = normalizeText(result?.data?.text);
  const confidence = Number.isFinite(result?.data?.confidence) ? result.data.confidence : null;

  return {
    fullText: text,
    pages: [
      {
        pageIndex: 1,
        source: 'ocr',
        text,
        confidence,
      },
    ],
    averageConfidence: confidence,
    warnings: text ? [] : ['OCR did not extract readable text from the image.'],
  };
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
        source: 'ocr',
        text: extracted.text,
        confidence: extracted.confidence,
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
  const fullText = normalizeText(orderedPages.map((page) => page.text).filter(Boolean).join('\n\n'));
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
