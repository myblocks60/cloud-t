import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ENABLE_CONVERT = true;  // true → convert all media to MP4 before upload
const ENABLE_RENAME = true;  // true → Base64-encode filename in Google Drive
const FUZZY_RENAME = true;    // true → extract SxxExx and append with _
const APPEND_STRING = "bugsbunny";     // add a custom string, append with _
const FILE_RANGE = "";        // e.g. "1-6" → only files 1 to 6, "5-5" → only file 5, "" → all files
// ────────────────────────────────────────────────────────────────────────────

console.log('Starting torrent download script (aria2 version)...');
console.log(`Feature flags → CONVERT: ${ENABLE_CONVERT}, RENAME: ${ENABLE_RENAME}, FUZZY: ${FUZZY_RENAME}, APPEND: "${APPEND_STRING}", FILE_RANGE: "${FILE_RANGE || 'ALL'}"`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`Script directory: ${__dirname}`);

const magnetURI = 'magnet:?xt=urn:btih:f3b63f5d9d8c0d8d2f6e6f9b4b8d7e6c5a4b3c2d&dn=Big.Buck.Bunny.1080p.mkv';
console.log(`Using magnet URI (truncated): ${magnetURI.substring(0, 80)}...`);

function getNameFromMagnet(uri) {
    const match = uri.match(/[?&]dn=([^&]+)/);
    if (match) {
        try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch { return null; }
    }
    return null;
}

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

// ─── Check aria2c is installed ───────────────────────────────────────────────
try {
    execSync('aria2c --version', { stdio: 'pipe' });
    console.log('✅ aria2c found.');
} catch {
    console.error('❌ aria2c is not installed or not in PATH.');
    console.error('   Install it: https://aria2.github.io/  or  choco install aria2');
    process.exit(1);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Step 1: Fetch metadata & list files using aria2c --show-files ───────────
async function listTorrentFiles() {
    console.log('\n📡 Fetching torrent metadata (this may take a moment)...');
    return new Promise((resolve, reject) => {
        const args = [
            '--show-files',
            '--bt-metadata-only=true',
            '--bt-save-metadata=true',
            '-d', __dirname,
            magnetURI
        ];

        let output = '';
        const proc = spawn('aria2c', args, { cwd: __dirname });

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
            // Parse the file listing from aria2c --show-files output
            // Format: idx|path/to/file|LENGTH|...
            const files = [];
            const lines = output.split('\n');
            let currentIdx = null;
            let currentPath = null;
            let currentSize = null;

            for (const line of lines) {
                const idxMatch = line.match(/^\s*(\d+)\|/);
                const pathMatch = line.match(/^\s*path=(.+)/i);
                const sizeMatch = line.match(/^\s*length=(\d+)/i);

                if (idxMatch) {
                    currentIdx = parseInt(idxMatch[1], 10);
                }
                if (pathMatch) {
                    currentPath = pathMatch[1].trim();
                }
                if (sizeMatch) {
                    currentSize = parseInt(sizeMatch[1], 10);
                }

                // When we have all info for a file, push it
                if (currentIdx !== null && currentPath !== null && currentSize !== null) {
                    files.push({
                        idx: currentIdx,
                        path: currentPath,
                        name: path.basename(currentPath),
                        size: currentSize
                    });
                    currentIdx = null;
                    currentPath = null;
                    currentSize = null;
                }
            }

            if (files.length === 0) {
                // Fallback: aria2 might not show files in --show-files for magnet
                // In this case, we skip listing and let aria2 download handle file discovery
                console.log('⚠️ Could not list files from metadata. Will discover files after download.');
                resolve(null);
            } else {
                resolve(files);
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to run aria2c: ${err.message}`));
        });
    });
}

// ─── Step 2: Download torrent using aria2c ───────────────────────────────────
function downloadTorrent() {
    return new Promise((resolve, reject) => {
        const args = [
            '--seed-time=0',            // Don't seed after download
            '--bt-stop-timeout=90',     // Stop if no progress for 90s
            '--max-connection-per-server=16',
            '--split=16',
            '--min-split-size=1M',
            '--file-allocation=none',
            '--continue=true',          // Resume if partially downloaded
            '--allow-overwrite=false',  // Prevent overwriting existing complete files
            '--auto-file-renaming=false',
            '--console-log-level=notice',
            '--summary-interval=5',     // Progress summary every 5 seconds
            '-d', __dirname,
            magnetURI
        ];

        // Add file selection if range is specified
        if (rangeStart !== null) {
            // Build the select-file list: "1,2,3,4,5,6" for range 1-6
            const indices = [];
            for (let i = rangeStart; i <= rangeEnd; i++) {
                indices.push(i);
            }
            args.splice(args.length - 1, 0, `--select-file=${indices.join(',')}`);
            console.log(`📌 aria2c --select-file=${indices.join(',')}`);
        }

        console.log('\n🚀 Starting download with aria2c...');
        console.log(`   Command: aria2c ${args.join(' ').substring(0, 200)}...`);

        const aria2 = spawn('aria2c', args, {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let torrentName = null;

        aria2.stdout.on('data', (data) => {
            const text = data.toString();
            process.stdout.write(text);

            // Try to capture the torrent name from aria2 output
            // Example: [NOTICE] Download complete: /path/to/downloaded_folder
            // Skip the metadata-only "MEMORY" name
            const nameMatch = text.match(/Download complete:\s*(.*)/);
            if (nameMatch) {
                const fullPath = nameMatch[1].trim();
                if (!fullPath.includes('[MEMORY][METADATA]')) {
                    torrentName = path.basename(fullPath);
                    console.log(`\n🔍 Detected download name: ${torrentName}`);
                }
            }

            // Handle errorCode=13 (File already exists but no control file)
            // This happens when resuming a complete file in a new session
            const error13Match = text.match(/errorCode=13 File (.*) exists/);
            if (error13Match) {
                const fullPath = error13Match[1].trim();
                torrentName = path.basename(fullPath);
                console.log(`\n✨ File/Folder already exists on disk: ${torrentName}`);
                console.log(`   (aria2c prevented overwriting to keep your data safe)`);
            }
        });

        aria2.stderr.on('data', (data) => {
            const text = data.toString();
            process.stderr.write(text);
        });

        aria2.on('close', (code) => {
            if (code === 0) {
                console.log('\n✅ aria2c download complete!');
                resolve(torrentName);
            } else {
                // aria2c exit code 7 = download incomplete but some files may be done
                // For other codes, still try to proceed
                console.log(`\n⚠️ aria2c exited with code ${code}. Checking for downloaded files...`);
                resolve(torrentName);
            }
        });

        aria2.on('error', (err) => {
            reject(new Error(`Failed to start aria2c: ${err.message}`));
        });
    });
}

// ─── Step 3: Discover downloaded files on disk ──────────────────────────────
function discoverDownloadedFiles(torrentName, listedFiles = null, rStart = null, rEnd = null) {
    console.log('\n🔍 Scanning for downloaded files...');

    const allEntries = [];

    // Priority 1: Use exact metadata if available
    if (listedFiles && listedFiles.length > 0) {
        console.log('Utilizing precise file paths from torrent metadata...');
        const selectedFiles = listedFiles.filter(f =>
            (rStart === null) || (f.idx >= rStart && f.idx <= rEnd)
        );

        for (const f of selectedFiles) {
            let fullPath = f.path;
            if (!path.isAbsolute(fullPath)) {
                fullPath = path.join(__dirname, f.path);
            }

            if (fs.existsSync(fullPath)) {
                if (fs.statSync(fullPath).isFile()) {
                    let relPath = fullPath;
                    if (fullPath.startsWith(__dirname)) {
                        relPath = path.relative(__dirname, fullPath);
                    }
                    allEntries.push({
                        name: f.name,
                        path: relPath,
                        absolutePath: fullPath,
                        size: fs.statSync(fullPath).size
                    });
                }
            } else {
                console.log(`⚠️ Expected file not found on disk: ${fullPath}`);
            }
        }

        if (allEntries.length > 0) {
            allEntries.sort((a, b) => a.name.localeCompare(b.name));
            return allEntries;
        }
    }

    // Priority 2: Fallback to scanning the parsed torrent name folder
    function scanDir(dir, relativeTo) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath, relativeTo);
            } else if (entry.isFile()) {
                // Skip non-media and non-relevant files
                const ext = path.extname(entry.name).toLowerCase();
                const skipExts = ['.aria2', '.torrent', '.json', '.js', '.md', '.txt', '.log', '.meta4'];
                if (!skipExts.includes(ext) && !entry.name.startsWith('.')) {
                    const relPath = path.relative(relativeTo, fullPath);
                    const size = fs.statSync(fullPath).size;
                    allEntries.push({
                        name: entry.name,
                        path: relPath,
                        absolutePath: fullPath,
                        size: size
                    });
                }
            }
        }
    }

    if (torrentName) {
        const torrentPath = path.isAbsolute(torrentName) ? torrentName : path.join(__dirname, torrentName);
        if (fs.existsSync(torrentPath)) {
            if (fs.statSync(torrentPath).isDirectory()) {
                scanDir(torrentPath, __dirname);
            } else if (fs.statSync(torrentPath).isFile()) {
                const ext = path.extname(torrentName).toLowerCase();
                const skipExts = ['.aria2', '.torrent', '.json', '.js', '.md', '.txt', '.log'];
                if (!skipExts.includes(ext) && !torrentName.startsWith('.')) {
                    let relPath = torrentPath;
                    if (torrentPath.startsWith(__dirname)) {
                        relPath = path.relative(__dirname, torrentPath);
                    }
                    allEntries.push({
                        name: torrentName,
                        path: relPath,
                        absolutePath: torrentPath,
                        size: fs.statSync(torrentPath).size
                    });
                }
            }
        }
    }

    // Priority 3: Final fallback - if nothing found yet, scan the entire script directory
    // This catches cases where torrentName extraction failed but files are there.
    if (allEntries.length === 0) {
        console.log('⚠️ Specific torrent folder not found. Scanning script directory for any media files...');
        scanDir(__dirname, __dirname);
    }

    // Sort by name for consistent ordering
    allEntries.sort((a, b) => a.name.localeCompare(b.name));

    return allEntries;
}

// ─── Convert MKV to MP4 using ffmpeg ─────────────────────────────────────────
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
            if (line.includes('time=')) {
                const timeMatch = line.match(/time=(\S+)/);
                if (timeMatch) {
                    process.stdout.write(`\r⏳ Converting... ${timeMatch[1]}`);
                }
            }
        });

        ffmpeg.on('close', (code) => {
            process.stdout.write('\n');
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`Failed to start ffmpeg: ${err.message}. Is ffmpeg installed?`));
        });
    });
}

// ─── Upload a file using gdrive.js ───────────────────────────────────────────
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
            resolve();
        });

        uploadProcess.on('error', (err) => {
            console.error(`❌ Error in upload process: ${err.message}`);
            resolve();
        });
    });
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────
async function main() {
    try {
        // Step 1: Try to list files first
        const listedFiles = await listTorrentFiles();
        if (listedFiles && listedFiles.length > 0) {
            console.log(`\n📋 Torrent contains ${listedFiles.length} file(s):`);
            listedFiles.forEach(f => {
                const fileNum = f.idx;
                const inRange = (rangeStart === null) || (fileNum >= rangeStart && fileNum <= rangeEnd);
                const marker = inRange ? '✅' : '⏭️';
                console.log(`${marker} #${fileNum} ${f.name}, size: ${(f.size / 1024 / 1024).toFixed(2)} MB`);
            });

            if (rangeStart !== null) {
                const selectedCount = listedFiles.filter(f => f.idx >= rangeStart && f.idx <= rangeEnd).length;
                console.log(`📌 Will download ${selectedCount} file(s) from range ${rangeStart}-${rangeEnd}`);
                if (selectedCount === 0) {
                    console.error(`❌ No files match the range. Exiting.`);
                    process.exit(1);
                }
            }
        }

        // Step 2: Check if files already exist before downloading
        let skipDownload = false;
        let torrentName = null;

        if (listedFiles && listedFiles.length > 0) {
            const expectedFiles = listedFiles.filter(f =>
                (rangeStart === null) || (f.idx >= rangeStart && f.idx <= rangeEnd)
            );

            const existingFiles = discoverDownloadedFiles(null, listedFiles, rangeStart, rangeEnd);

            if (existingFiles.length > 0 && existingFiles.length === expectedFiles.length) {
                console.log(`\n✨ All ${existingFiles.length} requested file(s) already exist on disk. Skipping download.`);
                skipDownload = true;
            }
        }

        if (!skipDownload) {
            torrentName = await downloadTorrent();
        }

        // Final fallback: if we still don't have a name, try to extract from magnet URI
        if (!torrentName) {
            torrentName = getNameFromMagnet(magnetURI);
        }

        // Step 3: Discover files on disk (final list for processing)
        let fileList = discoverDownloadedFiles(torrentName, listedFiles, rangeStart, rangeEnd);

        if (fileList.length === 0) {
            console.error('❌ No downloaded files found on disk!');
            process.exit(1);
        }

        // Number them and display
        console.log(`\n📋 Found ${fileList.length} file(s) on disk:`);
        fileList.forEach((f, i) => {
            const fileNum = i + 1;
            console.log(`  #${fileNum} ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
        });

        // Note: When FILE_RANGE is used, aria2c --select-file already handles
        // downloading only the specified files, so the files on disk ARE the
        // selected files. No further filtering needed for aria2 approach.

        // Step 4: Convert & Upload to Google Drive
        console.log('\n🚀 Starting conversion & upload process to Google Drive...');
        const gdriveScriptPath = path.join(__dirname, 'gdrive.js');

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📄 [${i + 1}/${fileList.length}] Processing: ${file.name}`);

            const ext = path.extname(file.name).toLowerCase();
            let uploadFilePath = file.absolutePath;
            let convertedFilePath = null;

            console.log(`   Full path: ${file.absolutePath}`);
            console.log(`   Extension: ${ext}`);

            // Convert to MP4 (changes file hash, keeps exact quality via stream copy)
            if (ENABLE_CONVERT) {
                // Determine output path. If it's already .mp4, we use a temporary name to allow "compulsory" re-muxing.
                const parsedPath = path.parse(file.absolutePath);
                if (ext === '.mp4') {
                    convertedFilePath = path.join(parsedPath.dir, parsedPath.name + '.converted.mp4');
                } else {
                    convertedFilePath = path.join(parsedPath.dir, parsedPath.name + '.mp4');
                }

                console.log(`🔄 Compulsory conversion: ${file.name} to MP4...`);
                console.log(`   Output: ${path.basename(convertedFilePath)}`);

                try {
                    await convertToMp4(file.absolutePath, convertedFilePath);
                    console.log(`✅ Conversion complete: ${path.basename(convertedFilePath)}`);
                    uploadFilePath = convertedFilePath;
                } catch (err) {
                    console.error(`❌ Conversion failed for ${file.name}: ${err.message}`);
                    console.log(`⚠️ Uploading original file instead...`);
                    convertedFilePath = null;
                }
            } else {
                console.log(`⏭️ Skipping conversion (ENABLE_CONVERT is false)`);
            }

            // Upload the file
            console.log(`🚀 Uploading: ${path.basename(uploadFilePath)}`);
            await uploadFile(gdriveScriptPath, uploadFilePath, ENABLE_RENAME, FUZZY_RENAME, APPEND_STRING);

            // Clean up converted MP4 to save disk space
            if (convertedFilePath) {
                try {
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

    } catch (err) {
        console.error(`❌ Fatal error: ${err.message}`);
        process.exit(1);
    }
}

main();
