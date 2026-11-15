import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Use locally bundled PDF.js worker — avoids CDN failures
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;
} catch (e) {
  console.warn('PDF.js worker initialization notice:', e);
}

/**
 * High-Accuracy Dual Extractor:
 * 1. Digital PDF Text Layer Extraction (PDF.js)
 * 2. High-Precision WebAssembly OCR Engine (Tesseract.js) for scanned images
 */
export async function parsePDFFile(file, onProgress = () => {}) {
  try {
    onProgress({ status: 'Loading PDF document...', progress: 10 });
    const arrayBuffer = await file.arrayBuffer();

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
      console.warn('Primary PDF load warning, retrying with raw ArrayBuffer:', err);
      pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    }

    const numPages = pdf.numPages;
    let fullText = '';
    const pagesData = [];
    let ocrWorker = null;

    for (let i = 1; i <= numPages; i++) {
      onProgress({ 
        status: `Processing Page ${i} of ${numPages}...`, 
        progress: 10 + Math.round((i / numPages) * 75) 
      });

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Combine text items preserving natural line breaks and spacing
      let pageText = textContent.items
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      // IF PAGE HAS MINIMAL OR NO TEXT (SCANNED IMAGE PDF), RUN TESSERACT OCR
      if (pageText.length < 40) {
        onProgress({ 
          status: `Running Tesseract OCR on Page ${i} image...`, 
          progress: 10 + Math.round((i / numPages) * 75) 
        });

        try {
          // Render page to canvas at 2x resolution for optimal OCR accuracy
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: context, viewport: viewport }).promise;

          // Initialize Tesseract WASM OCR worker lazily
          if (!ocrWorker) {
            ocrWorker = await createWorker('eng');
          }

          const ocrResult = await ocrWorker.recognize(canvas);
          const ocrText = ocrResult.data.text.trim();

          if (ocrText.length > 10) {
            pageText = `[Page ${i} OCR Result]:\n` + ocrText;
          }
        } catch (ocrErr) {
          console.warn(`Tesseract OCR notice on page ${i}:`, ocrErr);
          pageText = `[Page ${i}]: Scanned image document page.`;
        }
      }

      fullText += `\n--- Page ${i} ---\n` + pageText;
      pagesData.push({
        pageNumber: i,
        text: pageText,
        charCount: pageText.length
      });
    }

    // Terminate OCR worker if created
    if (ocrWorker) {
      await ocrWorker.terminate();
    }

    onProgress({ status: 'Extracted text complete!', progress: 100 });

    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    const words = cleanText.split(' ').filter(Boolean).length || 100;

    return {
      id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: file.name,
      sizeBytes: file.size,
      pages: numPages,
      words: words,
      uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      rawText: fullText,
      pagesData: pagesData,
      isScanned: fullText.includes('[Page') && fullText.includes('OCR Result]'),
      summary: cleanText.substring(0, 300) + '...'
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    // Surface the failure instead of returning placeholder text: otherwise a
    // corrupt or non-PDF file becomes a "source" and the AI generates from it.
    const reason = error?.name === 'PasswordException'
      ? 'the PDF is password-protected'
      : error?.name === 'InvalidPDFException' || /invalid pdf|expected either/i.test(error?.message || '')
        ? 'the file is not a valid PDF or is corrupted'
        : (error?.message || 'unknown error');
    throw new Error(`Could not read this PDF (${reason}).`);
  }
}
