# DCAN-Manga-Downloader

A Chrome Extension That Allows Users to Download Manga Chapters From [manga.detectiveconanar.com](https://manga.detectiveconanar.com/manga/).

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [How to Use](#how-to-use)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Chapter Listing**: Automatically detects and lists all available chapters on a manga series page.
- **Manga Title Extraction**: Displays the title of the manga series.
- **Chapter Selection**: Allows users to select individual chapters, select all, or deselect all.
- **Chapter Search**: Filter chapters by name using a search bar.
- **Chapter Range Selection**: Download chapters within a specified numerical range.
- **Chapter Sorting**: Sort chapters in ascending or descending order.
- **Background Downloading**: Downloads selected chapters in the background without interrupting Browse.
- **Image to ZIP Conversion**: Converts chapter images into a `.zip` file for easy storage.
- **Error Handling**: Provides feedback for various download states and errors.
- **Automatic Cancellation**: Stops downloads if the target tab is closed or navigates away from the manga page.

## Installation

To install this extension in your Chrome browser:

1. **Download the repository**:

    ```bash
    git clone [https://github.com/YOUR_USERNAME/DCAN-Manga-Downloader.git](https://github.com/ismailmajeeb/DCAN-Manga-Downloader.git)
    ```

2. **Open Chrome Extensions page**:
    - Open Chrome.
    - Type `chrome://extensions` in the address bar and press Enter.

3. **Enable Developer Mode**:
    - In the top right corner of the Extensions page, toggle on "Developer mode".

4. **Load the unpacked extension**:
    - Click on the "Load unpacked" button that appears.
    - Navigate to the directory where you cloned this repository (`DCAN-Manga-Downloader`) and select the folder.

5. **Extension Installed**:
    - The "Manga Chapter Downloader" extension should now appear in your list of extensions. You might want to pin it for easy access.

## How to Use

1. **Navigate to a Manga Page**: Go to a manga series page on [manga.detectiveconanar.com](https://manga.detectiveconanar.com/manga/) (e.g., `https://manga.detectiveconanar.com/manga/detective-conan/`).
2. **Open the Extension Popup**: Click on the "Manga Chapter Downloader" extension icon in your Chrome toolbar.
3. **Select Chapters**:
    - The popup will display a list of chapters for the current manga.
    - You can use the search bar to filter chapters.
    - Use the "Start Chapter" and "End Chapter" fields along with the "Apply Range" button to select a specific range of chapters.
    - Check the boxes next to the chapters you wish to download.
    - Use "Select All" or "Deselect All" buttons as needed.
    - Click "Sort Chapters" to change the sorting order.
4. **Download**: Click the "Download Selected" button.
5. **Monitoring**: A success message will appear in the popup, indicating that the download has started. You can close the popup and continue Browse. The downloads will appear in your browser's default download location, organized under `DC/Manga Title/Chapter Name.zip`.
6. **Cancellation**: If you close the tab from which the download was initiated or navigate away from `manga.detectiveconanar.com/manga/`, any ongoing downloads for that tab will be automatically cancelled.

## Project Structure

- `background.js`: The service worker script that handles background tasks such as managing download queues, creating ZIP files using `JSZip`, and initiating Chrome downloads. It also manages active downloads and cancels them if the source tab is closed or changed.
- `content.js`: The content script injected into `manga.detectiveconanar.com` pages. It's responsible for extracting chapter information and individual image URLs from the web page, fetching images as base64 data, and communicating with `background.js`.
- `popup.html`: The HTML structure for the extension's popup user interface.
- `popup.js`: The JavaScript for the popup, handling user interactions, displaying chapters, filtering, sorting, and communicating with `content.js` and `background.js`.
- `popup.css`: Styling for the extension's popup.
- `manifest.json`: The manifest file defining the extension's metadata, permissions, content scripts, and background scripts.
- `lib/jszip.min.js`: The minified JSZip library used for creating `.zip` files in `background.js`.
- `icons/`: Contains the extension icons.
- `README.md`: This file.

## Contributing

Contributions are welcome! If you have suggestions for improvements, bug reports, or want to add new features, please feel free to:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add new feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Create a new Pull Request.

## License

This project is open-source and available under the [MIT License](LICENSE).
