// background.js (With Enhanced Logging)

try {
  importScripts("lib/jszip.min.js");
  console.log("✅ SUCCESS: JSZip library imported successfully.");
} catch (e) {
  console.error(
    "❌ ERROR: Critical failure trying to import 'lib/jszip.min.js'.",
    e,
  );
}

let activeDownloadTabId = null;
const chapterImageBuffers = new Map();

function forceStopAllDownloads(reason) {
  console.warn(`🛑 FORCE STOP: ${reason}. Clearing all pending operations.`);
  const keys = Array.from(chapterImageBuffers.keys());
  keys.forEach((key) => {
    const buffer = chapterImageBuffers.get(key);
    if (buffer && buffer.resolveCallback) {
      buffer.resolveCallback({
        success: false,
        error: `Operation cancelled: ${reason}`,
      });
    }
  });
  chapterImageBuffers.clear();
  activeDownloadTabId = null;
  console.log("- All buffers cleared and download process halted.");
}

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === activeDownloadTabId) {
    forceStopAllDownloads(`Target tab ${tabId} was closed`);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeDownloadTabId && changeInfo.url) {
    if (!changeInfo.url.includes("manga.detectiveconanar.com/manga/")) {
      forceStopAllDownloads(
        `Target tab ${tabId} navigated away to ${changeInfo.url}`,
      );
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startDownload") {
    if (request.tabId) {
      activeDownloadTabId = request.tabId;
      console.log(
        `🟢 INFO: 'startDownload' message received for Tab ID: ${activeDownloadTabId}`,
      );
      downloadChaptersInBackground(request.chapters, request.mangaTitle);
      sendResponse({ success: true, message: "Download started." });
    } else {
      console.error(
        "❌ ERROR: 'startDownload' message received without a tabId.",
      );
      sendResponse({ success: false, message: "Missing tab ID." });
    }
  } else if (request.action === "imageChunk") {
    const { chapterName, imageIndex, base64, error } = request;
    if (!chapterImageBuffers.has(chapterName)) {
      console.warn(
        `[Background] Ignoring image chunk for inactive chapter: ${chapterName}.`,
      );
      return;
    }
    const buffer = chapterImageBuffers.get(chapterName);
    if (error) {
      console.error(
        `[Chapter: ${chapterName}] Received error for image ${imageIndex}: ${error}`,
      );
      buffer.receivedImages.push({ index: imageIndex, error: error });
    } else {
      // This log is too noisy for normal use, but useful for deep debugging.
      // console.log(`[Chapter: ${chapterName}] Received image chunk ${imageIndex}.`);
      buffer.receivedImages.push({ index: imageIndex, base64: base64 });
    }
  } else if (request.action === "chapterDownloadComplete") {
    const { chapterName, totalImages } = request;
    const buffer = chapterImageBuffers.get(chapterName);
    console.log(
      `[Chapter: ${chapterName}] Received 'chapterDownloadComplete'. Expected: ${totalImages}, Received: ${buffer?.receivedImages.length || 0}`,
    );
    if (buffer && buffer.resolveCallback) {
      buffer.receivedImages.sort((a, b) => a.index - b.index);
      buffer.resolveCallback({
        success: true,
        images: buffer.receivedImages.filter((img) => !img.error),
        totalImages: totalImages,
      });
    }
  } else if (request.action === "chapterDownloadError") {
    const { chapterName, error } = request;
    console.error(
      `[Chapter: ${chapterName}] Received 'chapterDownloadError': ${error}`,
    );
    const buffer = chapterImageBuffers.get(chapterName);
    if (buffer && buffer.resolveCallback) {
      buffer.resolveCallback({ success: false, error: error });
    }
  }
  return true;
});

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) =>
      reject(reader.error || new Error("FileReader failed."));
    reader.readAsDataURL(blob);
  });
}

async function downloadChaptersInBackground(chapters, mangaTitle) {
  console.log(
    `🔵 INFO: Starting download process for ${chapters.length} chapter(s). Manga: "${mangaTitle}"`,
  );

  for (const chapter of chapters) {
    if (activeDownloadTabId === null) {
      console.log("Download process was cancelled. Aborting loop.");
      break;
    }

    console.log(`[Chapter: ${chapter.name}] --- Starting Process ---`);
    try {
      let chapterImagesPromise = new Promise((resolve) => {
        console.log(
          `[Chapter: ${chapter.name}]   - Creating promise and buffer.`,
        );
        chapterImageBuffers.set(chapter.name, {
          receivedImages: [],
          resolveCallback: resolve,
        });
      });

      console.log(
        `[Chapter: ${chapter.name}]   - Sending message to content script to fetch images.`,
      );
      chrome.tabs.sendMessage(
        activeDownloadTabId,
        {
          action: "startChapterImageFetch",
          chapterUrl: chapter.url,
          chapterName: chapter.name,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              `[Chapter: ${chapter.name}]   - Error sending message: ${chrome.runtime.lastError.message}`,
            );
            const buffer = chapterImageBuffers.get(chapter.name);
            if (buffer && buffer.resolveCallback) {
              buffer.resolveCallback({
                success: false,
                error: chrome.runtime.lastError.message,
              });
            }
          }
        },
      );

      console.log(
        `[Chapter: ${chapter.name}]   - Awaiting all image chunks...`,
      );
      const chapterResult = await chapterImagesPromise;

      if (chapterResult.success) {
        const images = chapterResult.images;
        console.log(
          `[Chapter: ${chapter.name}] ✅ SUCCESS: Received ${images.length} of ${chapterResult.totalImages} images from content script.`,
        );

        if (images.length === 0) {
          console.warn(
            `[Chapter: ${chapter.name}] ⚠️ WARNING: No images were successfully downloaded. Skipping ZIP creation.`,
          );
          continue;
        }

        console.log(`[Chapter: ${chapter.name}]   - Creating ZIP file...`);
        const zipBlob = await createZip(images, chapter.name);
        console.log(
          `[Chapter: ${chapter.name}]   - ZIP Blob created. Size: ${zipBlob.size} bytes.`,
        );

        const dataUrl = await blobToDataURL(zipBlob);
        const sanitizedChapterName = chapter.name.replace(
          /[\/\\?%*:|"<>]/g,
          "-",
        );
        const filename = `DC/${mangaTitle}/${sanitizedChapterName}.zip`;

        console.log(
          `[Chapter: ${chapter.name}]   - Initiating download: "${filename}"`,
        );
        chrome.downloads.download(
          { url: dataUrl, filename: filename, saveAs: false },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error(
                `[Chapter: ${chapter.name}] ❌ DOWNLOAD FAILED:`,
                chrome.runtime.lastError.message,
              );
            } else {
              console.log(
                `[Chapter: ${chapter.name}] ✅ FINAL SUCCESS: Download started with ID: ${downloadId}.`,
              );
            }
          },
        );
      } else {
        console.error(
          `[Chapter: ${chapter.name}] ❌ FAILED: Did not receive images successfully. Reason: ${chapterResult.error}`,
        );
      }
    } catch (error) {
      console.error(
        `[Chapter: ${chapter.name}] ❌ FATAL ERROR in download loop:`,
        error,
      );
    } finally {
      console.log(`[Chapter: ${chapter.name}]   - Cleaning up memory buffer.`);
      chapterImageBuffers.delete(chapter.name);
      console.log(`[Chapter: ${chapter.name}] --- Finished Process ---`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("🔵 INFO: All selected chapters have been processed.");
  activeDownloadTabId = null;
}

async function createZip(images, chapterName) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip library is not loaded.");
  }

  const zip = new JSZip();
  images.forEach((image) => {
    if (image && typeof image.base64 === "string") {
      const filename = `${String(image.index + 1).padStart(3, "0")}.jpg`;
      zip.file(filename, image.base64, { base64: true });
    } else {
      console.warn(
        `[Chapter: ${chapterName}] Skipped invalid image data at index ${image?.index || "unknown"}.`,
      );
    }
  });
  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
