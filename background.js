// --- Step 1: Attempt to import the JSZip library ---
try {
  importScripts("lib/jszip.min.js");
  console.log("✅ SUCCESS: JSZip library imported successfully.");
} catch (e) {
  console.error(
    "❌ ERROR: Critical failure trying to import 'lib/jszip.min.js'.",
    e,
  );
}

// --- Global variable to hold the active tab ID ---
let activeTabId;

chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length > 0) {
    activeTabId = tabs[0].id;
  }
});

// --- Map to hold images being collected for each chapter ---
// Key: chapterName, Value: { receivedImages: Array, expectedImages: Promise.resolve, resolveCallback: Function }
const chapterImageBuffers = new Map();

// --- Listener for messages from the popup and content script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startDownload") {
    console.log("🟢 INFO: 'startDownload' message received from popup.");
    downloadChaptersInBackground(request.chapters, request.mangaTitle);
    sendResponse({ success: true, message: "Download started." });
  } else if (request.action === "imageChunk") {
    // Message from content script with an individual image chunk
    const { chapterName, imageIndex, base64, error } = request;

    if (!chapterImageBuffers.has(chapterName)) {
      console.warn(
        `[Background] Received image chunk for unknown chapter: ${chapterName}. Initializing buffer.`,
      );
      // This should ideally not happen if flow is correct, but for robustness:
      chapterImageBuffers.set(chapterName, {
        receivedImages: [],
        resolveCallback: null, // This will be set when startChapterImageFetch returns a promise
        expectedImagesPromise: null, // This will be set by the background script's internal logic
      });
    }

    const buffer = chapterImageBuffers.get(chapterName);

    if (base64) {
      buffer.receivedImages.push({ index: imageIndex, base64: base64 });
    } else if (error) {
      console.error(
        `[Background] Content script reported error for image ${imageIndex} of ${chapterName}: ${error}`,
      );
      // We still add a placeholder to ensure the count is correct for completion check
      buffer.receivedImages.push({ index: imageIndex, error: error });
    }
  } else if (request.action === "chapterDownloadComplete") {
    // Message from content script indicating all images for a chapter have been sent
    const { chapterName, totalImages } = request;
    console.log(
      `[Background] Received 'chapterDownloadComplete' for ${chapterName}. Expected: ${totalImages}, Received: ${chapterImageBuffers.get(chapterName)?.receivedImages.length || 0}`,
    );

    const buffer = chapterImageBuffers.get(chapterName);
    if (buffer && buffer.resolveCallback) {
      // Sort images by index to ensure correct order
      buffer.receivedImages.sort((a, b) => a.index - b.index);
      buffer.resolveCallback({
        success: true,
        images: buffer.receivedImages.filter((img) => !img.error), // Only pass successful images
        totalImages: totalImages,
      });
      chapterImageBuffers.delete(chapterName); // Clean up buffer
    } else {
      console.warn(
        `[Background] 'chapterDownloadComplete' received for ${chapterName} but no active promise to resolve.`,
      );
    }
  } else if (request.action === "chapterDownloadError") {
    // Message from content script indicating an error occurred during chapter image extraction
    const { chapterName, error } = request;
    console.error(
      `[Background] Content script reported 'chapterDownloadError' for ${chapterName}: ${error}`,
    );
    const buffer = chapterImageBuffers.get(chapterName);
    if (buffer && buffer.resolveCallback) {
      buffer.resolveCallback({ success: false, error: error });
      chapterImageBuffers.delete(chapterName); // Clean up buffer
    }
  }
  return true; // Keep the message channel open for async response
});

// --- Function to convert a Blob to a Data URL ---
function blobToDataURL(blob) {
  // Console logs are kept for robustness in case errors still occur here
  console.log(
    `🔵 INFO: In blobToDataURL. Blob type: ${blob?.type}, size: ${blob?.size}`,
  );
  if (!blob || !(blob instanceof Blob)) {
    console.error("❌ ERROR: blobToDataURL received an invalid blob object.");
    return Promise.reject(
      new Error("Invalid Blob object provided to blobToDataURL."),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      console.log("✅ INFO: FileReader onload completed.");
      resolve(reader.result);
    };
    reader.onerror = (e) => {
      console.error("❌ ERROR: FileReader onerror triggered.", e);
      reject(reader.error || new Error("FileReader failed."));
    };
    try {
      reader.readAsDataURL(blob);
      console.log("🔵 INFO: FileReader.readAsDataURL called.");
    } catch (e) {
      console.error("❌ ERROR: Error calling FileReader.readAsDataURL:", e);
      reject(e);
    }
  });
}

// --- Main function to orchestrate the download of multiple chapters ---
async function downloadChaptersInBackground(chapters, mangaTitle) {
  console.log(
    `🔵 INFO: Starting download process for ${chapters.length} chapter(s).`,
  );

  for (const chapter of chapters) {
    try {
      console.log(
        `[Chapter: ${chapter.name}] --- Requesting content script to fetch images... ---`,
      );

      // Setup a promise to wait for all image chunks for this chapter
      let chapterImagesPromise = new Promise((resolve) => {
        // Store the resolve function in our buffer map
        chapterImageBuffers.set(chapter.name, {
          receivedImages: [],
          resolveCallback: resolve,
        });
      });

      // Send message to content script to start fetching and sending images for this chapter
      chrome.tabs.sendMessage(
        activeTabId,
        {
          action: "startChapterImageFetch",
          chapterUrl: chapter.url,
          chapterName: chapter.name,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              `[Background] Error sending startChapterImageFetch message to content script: ${chrome.runtime.lastError.message}`,
            );
            const buffer = chapterImageBuffers.get(chapter.name);
            if (buffer && buffer.resolveCallback) {
              buffer.resolveCallback({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              chapterImageBuffers.delete(chapter.name); // Clean up
            }
          } else if (response && !response.success) {
            console.error(
              `[Background] Content script failed to start image fetch for ${chapter.name}: ${response.error}`,
            );
            const buffer = chapterImageBuffers.get(chapter.name);
            if (buffer && buffer.resolveCallback) {
              buffer.resolveCallback({ success: false, error: response.error });
              chapterImageBuffers.delete(chapter.name); // Clean up
            }
          } else {
            console.log(
              `[Background] Content script acknowledged start for ${chapter.name}.`,
            );
          }
        },
      );
      // Ensure the response from sendMessage is handled, but the actual images
      // will come via subsequent 'imageChunk' messages. We await chapterImagesPromise.

      const chapterResult = await chapterImagesPromise; // Wait until content script signals completion

      if (chapterResult.success) {
        const images = chapterResult.images;
        console.log(
          `[Chapter: ${chapter.name}] ✅ SUCCESS: Received ${images.length} successful images from content script.`,
        );

        if (images.length === 0) {
          console.warn(
            `[Chapter: ${chapter.name}] ⚠️ WARNING: No images successfully downloaded for zipping.`,
          );
          continue; // Skip zipping if no images were obtained
        }

        console.log(`[Chapter: ${chapter.name}] --- Creating ZIP file... ---`);
        const zipBlob = await createZip(images, chapter.name);
        console.log(
          `[Chapter: ${chapter.name}] ✅ SUCCESS: ZIP Blob created. Type: ${zipBlob?.type}, Size: ${zipBlob?.size} bytes.`,
        );

        if (zipBlob.size === 0) {
          console.error(
            `[Chapter: ${chapter.name}] ❌ ERROR: Generated ZIP file is empty.`,
          );
          continue;
        }

        console.log(
          `[Chapter: ${chapter.name}] --- Preparing to convert Blob to Data URL... ---`,
        );
        const dataUrl = await blobToDataURL(zipBlob);
        console.log(
          `[Chapter: ${chapter.name}] ✅ SUCCESS: Converted to Data URL.`,
        );

        const sanitizedChapterName = chapter.name.replace(
          /[\/\\?%*:|"<>]/g,
          "-",
        );
        const filename = `DC/${mangaTitle}/${sanitizedChapterName}.zip`;
        console.log(
          `[Chapter: ${chapter.name}] --- Initiating download with filename: ${filename} ---`,
        );

        chrome.downloads.download(
          {
            url: dataUrl,
            filename: filename,
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error(
                `[Chapter: ${chapter.name}] ❌ ERROR: chrome.downloads.download API failed.`,
                chrome.runtime.lastError.message,
              );
            } else if (downloadId) {
              console.log(
                `[Chapter: ${chapter.name}] ✅ FINAL SUCCESS: Download initiated with ID: ${downloadId}.`,
              );
            } else {
              console.error(
                `[Chapter: ${chapter.name}] ❌ ERROR: Download API did not return an ID or an error.`,
              );
            }
          },
        );
      } else {
        console.error(
          `[Chapter: ${chapter.name}] ❌ ERROR: Content script reported an error fetching images: ${chapterResult.error}`,
        );
      }
    } catch (error) {
      console.error(
        `[Chapter: ${chapter.name}] ❌ FATAL ERROR in processing loop for chapter "${chapter.name}":`,
        error,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay between chapters
  }
  console.log("🔵 INFO: All selected chapters have been processed.");
}

// --- Function to create a ZIP file from the image data ---
async function createZip(images, chapterName) {
  if (typeof JSZip === "undefined") {
    console.error(`[Chapter: ${chapterName}] ❌ ERROR: JSZip is not defined.`);
    throw new Error("JSZip library is not loaded.");
  }
  const zip = new JSZip();
  images.forEach((image) => {
    // Ensure image.base64 exists and is a string
    if (image && typeof image.base64 === "string") {
      const filename = `${String(image.index + 1).padStart(3, "0")}.jpg`;
      zip.file(filename, image.base64, { base64: true });
    } else {
      console.warn(
        `[Chapter: ${chapterName}] Skipped invalid or missing image data at index ${image?.index || "unknown"}.`,
      );
    }
  });
  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
