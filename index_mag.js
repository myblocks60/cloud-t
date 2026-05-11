import { spawn } from 'child_process';
import WebTorrent from 'webtorrent';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Get script directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`Script directory: ${__dirname}`);

// Initialize WebTorrent client
const client = new WebTorrent();
console.log('WebTorrent client initialized.');

// Prompt user for magnet link
rl.question('Enter Magnet Link: ', (magnetURI) => {
    if (!magnetURI.startsWith('magnet:?xt=')) {
        console.error('❌ Invalid Magnet Link!');
        rl.close();
        return;
    }

    console.log(`Using magnet URI: ${magnetURI}`);
    rl.close();

    client.add(magnetURI, { path: __dirname }, (torrent) => {
        console.log("✅ Torrent metadata received:");
        console.log(`Torrent name: ${torrent.name}`);
        console.log(`Total files in torrent: ${torrent.files.length}`);

        if (!torrent.files || torrent.files.length === 0) {
            console.error("❌ No files detected in torrent.");
            return;
        }

        torrent.files.forEach(file => {
            console.log(`📂 File detected: ${file.name}, size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
        });

        const interval = setInterval(() => {
            console.log(`⏳ Progress: ${(torrent.progress * 100).toFixed(2)}%`);
        }, 1000);

        setInterval(() => {
            console.log(`Speed: ${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s, Peers: ${torrent.numPeers}`);
        }, 1000);

        torrent.on('done', () => {
            console.log('✅ Download complete');
            clearInterval(interval);
            client.destroy();
            console.log('🚀 Starting upload process to Google Drive...');

            const folderName = torrent.name;

            torrent.files.forEach(file => {
                const filePath = `"${folderName}/${file.name}"`;
                const uploadProcess = spawn('node', ['gdrive.js', filePath], { shell: true, stdio: 'inherit' });

                uploadProcess.on('spawn', () => {
                    console.log(`🚀 Upload process started for ${file.name}`);
                });

                uploadProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log(`✅ Upload successful for ${file.name}`);
                    } else {
                        console.error(`❌ Upload failed for ${file.name} with exit code ${code}`);
                    }
                });

                uploadProcess.on('error', (err) => {
                    console.error(`❌ Error in upload process for ${file.name}:`, err.message);
                });
            });
        });

        torrent.on('error', (err) => {
            console.error('❌ Torrent download error:', err.message);
        });
    });
});
