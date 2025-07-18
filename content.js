// Content script to extract chapter information from the manga page

(function () {
  "use strict";

  // Function to extract chapters from the current page
  function extractChapters() {
    const chapters = [];
    const chapterElements = document.querySelectorAll("li.wp-manga-chapter");

    chapterElements.forEach((element) => {
      const linkElement = element.querySelector("a");
      const dateElement = element.querySelector(".chapter-release-date i");

      if (linkElement) {
        const chapterName = linkElement.textContent.trim();
        const chapterUrl = linkElement.href;
        const releaseDate = dateElement ? dateElement.textContent.trim() : "";

        chapters.push({
          name: chapterName,
          url: chapterUrl,
          date: releaseDate,
        });
      }
    });

    return chapters;
  }

  // Function to extract manga title
  function extractMangaTitle() {
    const titleSelectors = [
      "h1.entry-title",
      ".post-title h1",
      ".manga-title-badges h1",
      "h1",
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return "Unknown Manga";
  }

  // Function to convert image URL to base64
  async function imageUrlToBase64(url) {
    try {
      // Fetch the image directly from the content script context
      // No 'no-cors' needed as it's expected to be same-origin or handle CORS naturally
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `HTTP error! Status: ${response.status} for URL: ${url}`,
        );
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(
        `Error fetching or converting image ${url} to Base64:`,
        error,
      );
      throw error;
    }
  }

  // Function to extract and download chapter images one by one, sending them to background.js
  async function extractAndSendChapterImages(chapterUrl, chapterName) {
    console.log(
      `[Content Script] Starting image extraction for chapter: ${chapterName} from ${chapterUrl}`,
    );
    try {
      const response = await fetch(chapterUrl);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const imageElements = doc.querySelectorAll(".reading-content img");
      const imageUrls = Array.from(imageElements)
        .map((img) => img.getAttribute("src") || img.getAttribute("data-src"))
        .filter(Boolean);

      console.log(
        `[Content Script] Found ${imageUrls.length} image URLs for ${chapterName}.`,
      );

      // Send images one by one to background script
      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        try {
          const base64 = await imageUrlToBase64(imageUrl);
          chrome.runtime.sendMessage({
            action: "imageChunk",
            chapterName: chapterName,
            imageIndex: i,
            base64: base64,
          });
          console.log(
            `[Content Script] Sent image ${i} for ${chapterName} to background.`,
          );
          await new Promise((resolve) => setTimeout(resolve, 50)); // Small delay to prevent message congestion
        } catch (error) {
          console.error(
            `[Content Script] Failed to process and send image ${i} (${imageUrl}) for ${chapterName}:`,
            error,
          );
          // Send an error chunk to background script
          chrome.runtime.sendMessage({
            action: "imageChunk",
            chapterName: chapterName,
            imageIndex: i,
            error: error.message,
          });
        }
      }

      // Signal completion for this chapter to background script
      chrome.runtime.sendMessage({
        action: "chapterDownloadComplete",
        chapterName: chapterName,
        totalImages: imageUrls.length, // Send total count for verification
      });
      console.log(
        `[Content Script] Finished sending all images for chapter: ${chapterName}.`,
      );
      return {
        success: true,
        message: `Finished sending images for ${chapterName}.`,
      };
    } catch (error) {
      console.error(
        `[Content Script] Error extracting or sending chapter images for ${chapterName}:`,
        error,
      );
      // Signal error to background script
      chrome.runtime.sendMessage({
        action: "chapterDownloadError",
        chapterName: chapterName,
        error: error.message,
      });
      throw error; // Re-throw to propagate error to caller if needed
    }
  }

  // Listen for messages from the popup or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getChapters") {
      const chapters = extractChapters();
      const mangaTitle = extractMangaTitle();
      sendResponse({ chapters, mangaTitle });
    } else if (request.action === "startChapterImageFetch") {
      // New action to start fetching images in content.js
      extractAndSendChapterImages(request.chapterUrl, request.chapterName)
        .then((response) => {
          sendResponse(response); // Acknowledge the request to background
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep the message channel open for async response
    }
  });
})();
