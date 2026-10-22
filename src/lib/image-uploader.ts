import { fileToDataUrl } from "@/lib/image-client";
import { apiSend } from "@/lib/client-hooks";

export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  active: boolean;
}

/**
 * Concurrently uploads multiple images using a worker queue with controlled concurrency.
 * Client-side downscales images to 1920px max dimension before transmitting.
 */
export async function uploadImagesParallel(
  files: File[],
  onProgress?: (p: UploadProgress) => void,
  concurrency = 3,
): Promise<{ urls: string[]; failedCount: number }> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return { urls: [], failedCount: 0 };

  const total = images.length;
  let completed = 0;
  let failedCount = 0;
  const urls: string[] = [];

  const update = () => {
    onProgress?.({
      total,
      completed,
      failed: failedCount,
      active: completed + failedCount < total,
    });
  };

  update();

  // Queue runner with bounded concurrency
  let cursor = 0;
  async function worker() {
    while (cursor < total) {
      const idx = cursor++;
      const file = images[idx];
      try {
        const dataUrl = await fileToDataUrl(file, 1920, 0.85);
        const res = await apiSend<{ url: string }>("/api/uploads", "POST", { dataUrl });
        urls.push(res.url);
        completed++;
      } catch (err) {
        console.error(`[uploadImagesParallel] Upload failed for ${file.name}:`, err);
        failedCount++;
      } finally {
        update();
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return { urls, failedCount };
}
