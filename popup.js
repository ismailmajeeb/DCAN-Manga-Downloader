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
    sortChapters: document.getElementById("sort-chapters"), // Get the new sort button
    downloadSelected: document.getElementById("download-selected"),
    selectedCount: document.getElementById("selected-count"),
    status: document.getElementById("status"),
    rangeStart: document.getElementById("range-start"),
    rangeEnd: document.getElementById("range-end"),
    applyRange: document.getElementById("apply-range"),
  };

  let chapters = [];
  let selectedChapters = new Set();
  let isAscendingSort = true; // State for sorting order

  // Initialize the popup
  async function init() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.url || !tab.url.includes("manga.detectiveconanar.com/manga/")) {
        showNotMangaPage();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "getChapters" }, (response) => {
        if (chrome.runtime.lastError) {
          showError("Failed to communicate with page. Please refresh.");
          return;
        }
        if (response && response.chapters) {
          // Assign an original index for stable sorting and range filtering
          chapters = response.chapters.map((ch, index) => ({
            ...ch,
            id: index,
            originalIndex: index, // Store original index
            chapterNumber: extractChapterNumber(ch.name), // Extract chapter number
          }));
          elements.mangaTitle.textContent = response.mangaTitle;
          displayChapters();
          showMangaContent();
        } else {
          showError("No chapters found on this page.");
        }
      });
    } catch (error) {
      showError(`An error occurred: ${error.message}`);
    }
  }

  // Helper to extract chapter number for numerical sorting
  function extractChapterNumber(chapterName) {
    const match = chapterName.match(/(\d+(\.\d+)?)/); // Matches integers or decimals
    return match ? parseFloat(match[1]) : Infinity; // Return Infinity if no number found, so they sort to the end
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
    elements.chaptersList.innerHTML = "";
    let filteredAndSortedChapters = [...chapters]; // Create a mutable copy

    // Apply search filter
    if (filter) {
      filteredAndSortedChapters = filteredAndSortedChapters.filter((chapter) =>
        chapter.name.toLowerCase().includes(filter.toLowerCase()),
      );
    }

    // Apply range filter
    if (rangeStart !== null && rangeEnd !== null) {
      filteredAndSortedChapters = filteredAndSortedChapters.filter(
        (chapter) => {
          const chapterNum = chapter.chapterNumber;
          return chapterNum >= rangeStart && chapterNum <= rangeEnd;
        },
      );
    }

    // Apply sorting
    filteredAndSortedChapters.sort((a, b) => {
      const numA = a.chapterNumber;
      const numB = b.chapterNumber;

      if (numA === Infinity && numB === Infinity) {
        return 0; // Maintain original order if both are unnumbered
      }
      if (numA === Infinity) {
        return 1; // Unnumbered chapters come after numbered ones
      }
      if (numB === Infinity) {
        return -1; // Unnumbered chapters come after numbered ones
      }

      if (isAscendingSort) {
        return numA - numB;
      } else {
        return numB - numA;
      }
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

  elements.searchBar.addEventListener("input", (e) => {
    // Re-apply current range when searching
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);
    displayChapters(
      e.target.value,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  elements.selectAll.addEventListener("click", () => {
    // Select only currently displayed chapters
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

  // Sort button listener
  elements.sortChapters.addEventListener("click", () => {
    isAscendingSort = !isAscendingSort; // Toggle sort order
    // Re-display chapters with current filters and new sort order
    const currentFilter = elements.searchBar.value;
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);
    displayChapters(
      currentFilter,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  // Download handler
  elements.downloadSelected.addEventListener("click", () => {
    if (selectedChapters.size === 0) return;

    const chaptersToDownload = chapters.filter((ch) =>
      selectedChapters.has(ch.id),
    );
    const mangaTitle = elements.mangaTitle.textContent;

    chrome.runtime.sendMessage({
      action: "startDownload",
      chapters: chaptersToDownload,
      mangaTitle: mangaTitle,
    });

    showSuccess(
      `Download of ${selectedChapters.size} chapter(s) started. You can now close this popup.`,
    );

    // Optional: clear selection after starting download
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

  // Range filter event listeners
  elements.applyRange.addEventListener("click", () => {
    const start = parseFloat(elements.rangeStart.value);
    const end = parseFloat(elements.rangeEnd.value);

    // Basic validation
    if ((isNaN(start) && !isNaN(end)) || (!isNaN(start) && isNaN(end))) {
      showError(
        "Please enter both start and end values for range filter, or neither.",
      );
      return;
    }
    if (!isNaN(start) && !isNaN(end) && start > end) {
      showError("Start of range cannot be greater than end of range.");
      return;
    }
    elements.status.textContent = ""; // Clear any previous error messages

    const currentFilter = elements.searchBar.value;
    displayChapters(
      currentFilter,
      isNaN(start) ? null : start,
      isNaN(end) ? null : end,
    );
  });

  document.addEventListener("DOMContentLoaded", init);
})();
