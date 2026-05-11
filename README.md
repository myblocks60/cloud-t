# Cloud Torrent to Google Drive Uploader

A powerful Node.js tool to download torrents (via WebTorrent or aria2c), optionally convert MKV files to MP4, and upload them directly to a specific Google Drive folder with smart renaming options.

## 🚀 Features

- **Dual Download Engines**: Support for both `WebTorrent` (built-in) and `aria2c` (high-performance external engine).
- **Google Drive Integration**: Automated upload to a specific folder using a Service Account.
- **Smart Renaming**: 
  - Fuzzy matching for Season/Episode (e.g., `S01E05`).
  - Custom string appending.
  - Optional random 5-digit suffix to avoid filename collisions.
- **On-the-Fly Conversion**: Uses `ffmpeg` to convert `.mkv` to `.mp4` using stream copying (no quality loss, very fast).
- **Partial Downloads**: Download specific files from a torrent by index or range.

---

## 📋 Prerequisites

Before running the script, ensure you have the following installed:

1.  **Node.js** (v14 or higher)
2.  **FFmpeg**: Required for MKV to MP4 conversion.
    - [Download FFmpeg](https://ffmpeg.org/download.html)
3.  **aria2c** (Optional, but recommended for large torrents):
    - [Download aria2](https://aria2.github.io/)

---

## 🛠️ Setup Instructions

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Google Drive Credentials
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a Service Account and download the JSON key.
3.  Rename the JSON key to `credentials.json` and place it in the root directory.
    - See `service-account.example.json` for the expected format.
4.  **Important**: Share your target Google Drive folder with the Service Account email address (found in `client_email` inside your JSON).

### 3. Environment Variables
Create a `.env` file in the root directory (refer to `.env.example`):
```env
DRIVE_FOLDER_ID=your_google_drive_folder_id_here
```

---

## 📖 How to Use

### Step 1: List Torrent Files
Use `listfiles.js` to see the indices of the files inside a magnet link.
1.  Edit `listfiles.js` and paste your `magnetURI`.
2.  Run:
    ```bash
    node listfiles.js
    ```
3.  Note the indices (e.g., #5, #12) of the files you want.

### Step 2: Configure and Download
Choose your engine:

#### Option A: WebTorrent (`index.js`)
Good for simple, quick downloads.
1.  Edit `index.js`.
2.  Set `magnetURI`.
3.  Configure flags (see below).
4.  Run: `node index.js`

#### Option B: aria2c (`index-aria2.js`)
Recommended for large torrents or better performance.
1.  Edit `index-aria2.js`.
2.  Set `magnetURI`.
3.  Configure flags.
4.  Run: `node index-aria2.js`

---

## ⚙️ Configuration Flags

You can tweak these constants at the top of `index.js` or `index-aria2.js`:

| Flag | Description |
| :--- | :--- |
| `ENABLE_CONVERT` | If `true`, converts `.mkv` to `.mp4` before upload. |
| `ENABLE_RENAME` | If `true`, adds a 5-digit random number to the filename. |
| `FUZZY_RENAME` | If `true`, extracts patterns like `S01E01` and prioritizes them. |
| `APPEND_STRING` | A custom string to append to all uploaded filenames. |
| `FILE_RANGE` | Specify a range of files to download (e.g., `"1-5"`). |

---

## 🛡️ Security

- **`.gitignore`**: This project is pre-configured to ignore `credentials.json`, `.env`, and `token.json`. **Never** remove these from `.gitignore` if you plan to push to a public repository.
- **Service Account**: Using a Service Account is safer than personal OAuth tokens as it limits access to only specific shared folders.

---

## 📜 License
MIT
