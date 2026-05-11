import { spawn } from 'child_process';
import WebTorrent from 'webtorrent';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Feature Flags ────────────────────────────────────────────────────────────
const ENABLE_CONVERT = false;  // true → convert MKV to MP4 before upload
const ENABLE_RENAME = false;  // true → Base64-encode filename in Google Drive
const FUZZY_RENAME = true;    // true → extract SxxExx and append with _
const APPEND_STRING = "";     // add a custom string, append with _
const FILE_RANGE = "";        // e.g. "1-6" → only files 1 to 6, "5-5" → only file 5, "" → all files
// ──────────────────────────────────────────────────────────────────────────────

console.log('Starting torrent download script...');
console.log(`Feature flags → CONVERT: ${ENABLE_CONVERT}, RENAME: ${ENABLE_RENAME}, FUZZY: ${FUZZY_RENAME}, APPEND: "${APPEND_STRING}", FILE_RANGE: "${FILE_RANGE || 'ALL'}"`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`Script directory: ${__dirname}`);

const client = new WebTorrent();
console.log('WebTorrent client initialized.');

const magnetURI = 'magnet:?xt=urn:btih:f3b63f5d9d8c0d8d2f6e6f9b4b8d7e6c5a4b3c2d&dn=Big.Buck.Bunny.1080p.mkv'
console.log(`Using magnet URI: ${magnetURI}`);

// ─── Parse FILE_RANGE ─────────────────────────────────────────────────────────
let rangeStart = null;
let rangeEnd = null;
if (FILE_RANGE) {
    const match = FILE_RANGE.match(/^(\d+)-(\d+)$/);
    if (!match) {
        console.error(`❌ Invalid FILE_RANGE format: "${FILE_RANGE}". Use "start-end" e.g. "1-6" or "5-5".`);
        process.exit(1);
    }
    rangeStart = parseInt(match[1], 10);
    rangeEnd = parseInt(match[2], 10);
    if (rangeStart < 1 || rangeEnd < rangeStart) {
        console.error(`❌ Invalid FILE_RANGE values: start=${rangeStart}, end=${rangeEnd}. Start must be ≥ 1 and ≤ end.`);
        process.exit(1);
    }
    console.log(`📌 File range set: downloading files #${rangeStart} to #${rangeEnd} (inclusive)`);
}
// ──────────────────────────────────────────────────────────────────────────────

client.add(magnetURI, { path: __dirname }, (torrent) => {
    console.log("✅ Torrent metadata received:");
    // console.log(torrent); // Log the full object

    console.log(`Torrent name: ${torrent.name}`);
    console.log(`Total files in torrent: ${torrent.files.length}`);

    if (!torrent.files || torrent.files.length === 0) {
        console.error("❌ No files detected in torrent.");
        return;
    }

    // List all files and apply range filter
    const selectedFiles = [];
    torrent.files.forEach((file, idx) => {
        const fileNum = idx + 1; // 1-indexed
        const inRange = (rangeStart === null) || (fileNum >= rangeStart && fileNum <= rangeEnd);
        const marker = inRange ? '✅' : '⏭️';
        console.log(`${marker} #${fileNum} ${file.name}, size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);

        if (inRange) {
            selectedFiles.push({ file, fileNum });
        } else {
            file.deselect(); // Tell WebTorrent NOT to download this file
        }
    });

    if (rangeStart !== null) {
        console.log(`📌 Selected ${selectedFiles.length} file(s) for download`);
        if (selectedFiles.length === 0) {
            console.error(`❌ No files match the range ${rangeStart}-${rangeEnd}. Total files: ${torrent.files.length}. Nothing to download.`);
            client.destroy();
            return;
        }
    }

    // Calculate progress based ONLY on selected files
    const totalSelectedBytes = selectedFiles.reduce((sum, sf) => sum + sf.file.length, 0);

    const interval = setInterval(() => {
        const downloadedBytes = selectedFiles.reduce((sum, sf) => sum + sf.file.downloaded, 0);
        const progress = totalSelectedBytes > 0 ? (downloadedBytes / totalSelectedBytes * 100) : 0;
        console.log(`⏳ Progress: ${progress.toFixed(2)}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}/${(totalSelectedBytes / 1024 / 1024).toFixed(1)} MB)`);
    }, 1000);

    const speedInterval = setInterval(() => {
        console.log(`Speed: ${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s, Peers: ${torrent.numPeers}`);
    }, 1000);

    // ─── Track completion per-file instead of torrent.on('done') ─────────────
    // torrent.on('done') only fires when ALL files finish, which never happens
    // when files are deselected. Instead, we track each selected file individually.
    let completedCount = 0;
    let uploadStarted = false; // guard against duplicate triggers

    async function onAllSelectedDone() {
        if (uploadStarted) return; // prevent double-trigger
        uploadStarted = true;

        console.log('✅ All selected files downloaded!');
        clearInterval(interval);
        clearInterval(speedInterval);

        // Save file list BEFORE destroying client (destroy wipes torrent.files)
        const fileList = selectedFiles.map(sf => ({
            name: sf.file.name,
            path: sf.file.path,
            fileNum: sf.fileNum
        }));
        console.log(`📋 Saved file list: ${fileList.length} file(s) to process`);

        // Now safe to destroy torrent client
        client.destroy();
        console.log('🔌 Torrent client destroyed. Files are on disk.');

        console.log('🚀 Starting conversion & upload process to Google Drive...');

        const gdriveScriptPath = path.join(__dirname, 'gdrive.js');

        // Process files one at a time (sequential)
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📄 [${i + 1}/${fileList.length}] (File #${file.fileNum}) Processing: ${file.name}`);

            const absoluteFilePath = path.join(__dirname, file.path);
            const ext = path.extname(file.name).toLowerCase();
            let uploadFilePath = absoluteFilePath;
            let convertedFilePath = null;

            console.log(`   Full path: ${absoluteFilePath}`);
            console.log(`   Extension: ${ext}`);

            // Convert MKV to MP4 (changes file hash, keeps exact quality)
            if (ENABLE_CONVERT && ext === '.mkv') {
                convertedFilePath = absoluteFilePath.replace(/\.mkv$/i, '.mp4');
                console.log(`🔄 Converting ${file.name} to MP4...`);
                console.log(`   Output: ${convertedFilePath}`);

                try {
                    await convertToMp4(absoluteFilePath, convertedFilePath);
                    console.log(`✅ Conversion complete: ${path.basename(convertedFilePath)}`);
                    uploadFilePath = convertedFilePath;
                } catch (err) {
                    console.error(`❌ Conversion failed for ${file.name}: ${err.message}`);
                    console.log(`⚠️ Uploading original MKV instead...`);
                    convertedFilePath = null;
                }
            } else if (!ENABLE_CONVERT) {
                console.log(`⏭️ Skipping conversion (ENABLE_CONVERT is false)`);
            } else {
                console.log(`⏭️ Skipping conversion (not MKV)`);
            }

            // Upload the file
            console.log(`🚀 Uploading: ${path.basename(uploadFilePath)}`);
            await uploadFile(gdriveScriptPath, uploadFilePath, ENABLE_RENAME, FUZZY_RENAME, APPEND_STRING);

            // Clean up converted MP4 to save disk space
            if (convertedFilePath) {
                try {
                    const fs = await import('fs');
                    fs.unlinkSync(convertedFilePath);
                    console.log(`🧹 Cleaned up temp file: ${path.basename(convertedFilePath)}`);
                } catch (e) {
                    console.log(`⚠️ Could not clean up temp file: ${e.message}`);
                }
            }

            console.log(`✅ [${i + 1}/${fileList.length}] Done with: ${file.name}`);
        }

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log('🎉 All files processed!');
    }

    // If no range filter, use torrent.on('done') as normal (all files selected)
    if (rangeStart === null) {
        torrent.on('done', () => {
            onAllSelectedDone();
        });
    } else {
        // Track each selected file individually
        for (const sf of selectedFiles) {
            sf.file.on('done', () => {
                completedCount++;
                console.log(`✅ File #${sf.fileNum} done (${completedCount}/${selectedFiles.length}): ${sf.file.name}`);
                if (completedCount >= selectedFiles.length) {
                    onAllSelectedDone();
                }
            });
        }
    }

    torrent.on('error', (err) => {
        console.error('❌ Torrent download error:', err.message);
    });
});

// Convert MKV to MP4 using ffmpeg with stream copy (exact quality, no re-encoding)
function convertToMp4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c', 'copy',    // copy all streams as-is (no re-encoding)
            '-y',             // overwrite output if exists
            outputPath
        ]);

        ffmpeg.stderr.on('data', (data) => {
            const line = data.toString().trim();
            // Only log progress lines (contain 'time=')
            if (line.includes('time=')) {
                const timeMatch = line.match(/time=(\S+)/);
                if (timeMatch) {
                    process.stdout.write(`\r⏳ Converting... ${timeMatch[1]}`);
                }
            }
        });

        ffmpeg.on('close', (code) => {
            process.stdout.write('\n'); // newline after progress
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to start ffmpeg: ${err.message}. Is ffmpeg installed?`));
        });
    });
}

// Upload a file using gdrive.js
// Flags are forwarded to gdrive.js as CLI arguments
function uploadFile(gdriveScriptPath, filePath, enableRename = true, fuzzyRename = false, appendString = "") {
    return new Promise((resolve) => {
        const uploadProcess = spawn('node', [gdriveScriptPath, filePath, String(enableRename), String(fuzzyRename), appendString], {
            stdio: 'inherit'
        });

        uploadProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Upload successful for ${path.basename(filePath)}`);
            } else {
                console.error(`❌ Upload failed for ${path.basename(filePath)} with exit code ${code}`);
            }
            resolve(); // always resolve to continue with next file
        });

        uploadProcess.on('error', (err) => {
            console.error(`❌ Error in upload process: ${err.message}`);
            resolve();
        });
    });
}
