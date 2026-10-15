import { createWorker, type Worker, OEM } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

let cachedWorkerBlobUrl: string | null = null;

/**
 * Returns local base paths for offline Tesseract assets (core wasm and traineddata).
 * Compatible with both Vite development and Tauri production WebViews.
 */
function getTesseractLocalPaths() {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";

  return {
    corePath: `${origin}/tesseract`,
    langPath: `${origin}/tesseract/tessdata`,
  };
}

/**
 * Fetches the local worker script and creates a same-origin Blob URL.
 * This guarantees the WebWorker is spawned without remote network requests or importScripts blocking.
 */
async function getWorkerBlobUrl(): Promise<string> {
  if (cachedWorkerBlobUrl) {
    return cachedWorkerBlobUrl;
  }
  const res = await fetch("/tesseract/worker.min.js");
  if (!res.ok) {
    throw new Error(`Failed to load local OCR worker script: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  cachedWorkerBlobUrl = URL.createObjectURL(
    new Blob([blob], { type: "application/javascript" })
  );
  return cachedWorkerBlobUrl;
}

/**
 * Creates and initializes a Tesseract worker using 100% offline local bundled assets.
 */
async function createConfiguredWorker(languages: string = "eng+ind"): Promise<Worker> {
  const { corePath, langPath } = getTesseractLocalPaths();
  const workerBlobUrl = await getWorkerBlobUrl();

  console.log(`[ocrService] Initializing offline local Tesseract worker (${languages})...`);
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    workerPath: workerBlobUrl,
    corePath,
    langPath,
    gzip: true,
    workerBlobURL: false, // Spawns directly from preloaded blob without importScripts CDN call
  });
  console.log(`[ocrService] Local offline worker (${languages}) initialized successfully.`);
  return worker;
}

/**
 * Get or initialize the singleton Tesseract Worker.
 * Default languages: 'eng+ind' with automatic fallback to 'eng'.
 */
async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        return await createConfiguredWorker("eng+ind");
      } catch (err) {
        console.warn(
          "[ocrService] 'eng+ind' initialization failed, falling back to 'eng':",
          err
        );
        return await createConfiguredWorker("eng");
      }
    })();
  }
  return workerPromise;
}

/**
 * Extracts text from an image region (base64 Data URL) using Tesseract.js.
 * @param imageDataUrl Image data URL (image/png or image/jpeg)
 * @returns Extracted OCR text
 */
export async function extractTextFromArea(
  imageDataUrl: string
): Promise<string> {
  if (!imageDataUrl) {
    throw new Error("Image data URL is empty");
  }

  try {
    const worker = await getOcrWorker();
    const result = await worker.recognize(imageDataUrl);
    return result.data.text.trim();
  } catch (err) {
    console.error("[ocrService] OCR execution failed, refreshing worker:", err);
    // If old worker failed, reset promise and create a fresh worker
    workerPromise = null;
    const freshWorker = await createConfiguredWorker("eng");
    const result = await freshWorker.recognize(imageDataUrl);
    return result.data.text.trim();
  }
}

/**
 * Clean up Tesseract worker when no longer needed.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch (e) {
      console.error("[ocrService] Failed to terminate worker:", e);
    } finally {
      workerPromise = null;
    }
  }
}
