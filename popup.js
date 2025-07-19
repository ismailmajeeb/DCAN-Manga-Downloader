// popup.js (With Enhanced Logging)

(function () {
  "use strict";

  // DOM elements
  const elements = {
    mangaTitle: document.getElementById("manga-title"),
    notMangaPage: document.getElementById("not-manga-page"),
    mangaContent: document.getElementById("manga-content"),
    searchBar: document.getElementById("search-bar"),
    chaptersList: document.getElementById("chapters-list"),
    selectAll: document.getElementById("select-all"),
    deselectAll: document.getElementById("deselect-all"),
    sortChapters: document.getElementById("sort-chapters"),
    downloadSelected: document.getElementById("download-selected"),
    selectedCount: document.getElementById("selected-count"),
    status: document.getElementById("status"),
    rangeStart: document.getElementById("range-start"),
    rangeEnd: document.getElementById("range-end"),
    applyRange: document.getElementById("apply-range"),
  };

  let chapters = [];
  let selectedChapters = new Set();
  let isAscendingSort = true;
  let activeTabId = null;

  // Initialize the popup
  async function init() {
    console.log(" M Popup: Initializing...");
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      activeTabId = tab.id;
      console.log(` M Popup: Active Tab ID set to ${activeTabId}`);

      if (!tab.url || !tab.url.includes("manga.detectiveconanar.com/manga/")) {
        showNotMangaPage();
        console.warn(" M Popup: Not a valid manga page.");
        return;
      }

      console.log(
        " M Popup: Sending 'getChapters' message to content script...",
      );
      chrome.tabs.sendMessage(tab.id, { action: "getChapters" }, (response) => {
        if (chrome.runtime.lastError) {
          showError("Failed to communicate with page. Please refresh.");
          console.error(
            " M Popup: Communication error with content script:",
            chrome.runtime.lastError.message,
          );
          return;
        }
        if (response && response.chapters) {
          console.log(
            ` M Popup: Received ${response.chapters.length} chapters.`,
          );
          chapters = response.chapters.map((ch, index) => ({
            ...ch,
            id: index,
            originalIndex: index,
            chapterNumber: extractChapterNumber(ch.name),
          }));
          elements.mangaTitle.textContent = response.mangaTitle;
          displayChapters();
          showMangaContent();
        } else {
          showError("No chapters found on this page.");
          console.error(" M Popup: Invalid response from content script.");
        }
      });
    } catch (error) {
      showError(`An error occurred: ${error.message}`);
      console.error(" M Popup: Initialization failed:", error);
    }
  }

  // Helper to extract chapter number
  function extractChapterNumber(chapterName) {
    const match = chapterName.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : Infinity;
  }

  // UI display functions
  function showNotMangaPage() {
    elements.notMangaPage.classList.remove("hidden");
    elements.mangaContent.classList.add("hidden");
  }

  function showMangaContent() {
    elements.notMangaPage.classList.add("hidden");
    elements.mangaContent.classList.remove("hidden");
  }

  function displayChapters(filter = "", rangeStart = null, rangeEnd = null) {
    // ... (This function's logic is UI-heavy and doesn't need extra logs) ...
    elements.chaptersList.innerHTML = "";
    let filteredAndSortedChapters = [...chapters];

    if (filter) {
      filteredAndSortedChapters = filteredAndSortedChapters.filter((chapter) =>
        chapter.name.toLowerCase().includes(filter.toLowerCase()),
      );
    }

    if (rangeStart !== null && rangeEnd !== null) {
      filteredAndSortedChapters = filteredAndSortedChapters.filter(
        (chapter) => {
          const chapterNum = chapter.chapterNumber;
          return chapterNum >= rangeStart && chapterNum <= rangeEnd;
        },
      );
    }

    filteredAndSortedChapters.sort((a, b) => {
      const numA = a.chapterNumber;
      const numB = b.chapterNumber;

      if (numA === Infinity && numB === Infinity) return 0;
      if (numA === Infinity) return 1;
      if (numB === Infinity) return -1;

      return isAscendingSort ? numA - numB : numB - numA;
    });

    if (filteredAndSortedChapters.length === 0) {
      elements.chaptersList.innerHTML =
        '<div class="message">No chapters found matching your criteria.</div>';
      return;
    }

    filteredAndSortedChapters.forEach((chapter) => {
      const chapterItem = createChapterElement(chapter);
      elements.chaptersList.appendChild(chapterItem);
    });
  }

  function createChapterElement(chapter) {
    // ... (This function is also UI-heavy and doesn't need extra logs) ...
    const div = document.createElement("div");
    div.className = "chapter-item";
    div.dataset.chapterId = chapter.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `chapter-${chapter.id}`;
    checkbox.checked = selectedChapters.has(chapter.id);
    checkbox.addEventListener("change", () =>
      handleChapterSelection(chapter.id),
    );

    const info = document.createElement("div");
    info.className = "chapter-info";
    const name = document.createElement("div");
    name.className = "chapter-name";
    name.textContent = chapter.name;
    const date = document.createElement("div");
    date.className = "chapter-date";
    date.textContent = chapter.date;

    info.appendChild(name);
    if (chapter.date) info.appendChild(date);
    div.appendChild(checkbox);
    div.appendChild(info);

    return div;
  }

  // Selection and search handlers
  function handleChapterSelection(id) {
    if (selectedChapters.has(id)) {
      selectedChapters.delete(id);
    } else {
      selectedChapters.add(id);
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    elements.selectedCount.textContent = selectedChapters.size;
    elements.downloadSelected.disabled = selectedChapters.size === 0;
  }

  // Download handler
  elements.downloadSelected.addEventListener("click", () => {
    if (selectedChapters.size === 0) return;

    const chaptersToDownload = chapters.filter((ch) =>
      selectedChapters.has(ch.id),
    );
    const mangaTitle = elements.mangaTitle.textContent;

    console.log(
      ` M Popup: Download button clicked. Preparing to send ${chaptersToDownload.length} chapters to background script.`,
    );

    chrome.runtime.sendMessage({
      action: "startDownload",
      chapters: chaptersToDownload,
      mangaTitle: mangaTitle,
      tabId: activeTabId,
    });

    showSuccess(
      `Download of ${selectedChapters.size} chapter(s) started. You can now close this popup.`,
    );

    elements.deselectAll.click();
  });

  // Status message functions
  function showError(message) {
    elements.status.textContent = message;
    elements.status.className = "status error";
  }

  function showSuccess(message) {
    elements.status.textContent = message;
    elements.status.className = "status success";
    setTimeout(() => {
      elements.status.textContent = "";
      elements.status.className = "status";
    }, 5000);
  }

  // Event Listeners (no extra logging needed here)
  elements.searchBar.addEventListener("input", (e) => {
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);
    displayChapters(
      e.target.value,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  elements.selectAll.addEventListener("click", () => {
    document.querySelectorAll(".chapter-item").forEach((item) => {
      const id = parseInt(item.dataset.chapterId, 10);
      selectedChapters.add(id);
      item.querySelector('input[type="checkbox"]').checked = true;
    });
    updateSelectionUI();
  });

  elements.deselectAll.addEventListener("click", () => {
    selectedChapters.clear();
    document
      .querySelectorAll(".chapter-item input:checked")
      .forEach((checkbox) => {
        checkbox.checked = false;
      });
    updateSelectionUI();
  });

  elements.sortChapters.addEventListener("click", () => {
    isAscendingSort = !isAscendingSort;
    const currentFilter = elements.searchBar.value;
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);
    displayChapters(
      currentFilter,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  elements.applyRange.addEventListener("click", () => {
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);

    if ((isNaN(start) && !isNaN(end)) || (!isNaN(start) && isNaN(end))) {
      showError("Please enter both start and end values, or neither.");
      return;
    }
    if (!isNaN(start) && !isNaN(end) && start > end) {
      showError("Start of range cannot be greater than end.");
      return;
    }
    elements.status.textContent = "";

    const currentFilter = elements.searchBar.value;
    displayChapters(
      currentFilter,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  document.addEventListener("DOMContentLoaded", init);
})();
