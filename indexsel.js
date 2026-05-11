import { spawn } from 'child_process';
import WebTorrent from 'webtorrent';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

console.log('Starting torrent download script...');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`Script directory: ${__dirname}`);

const client = new WebTorrent();
console.log('WebTorrent client initialized.');

import { spawn } from 'child_process';
const magnetURI = 'magnet:?xt=urn:btih:6b8d9f7c5a4e3d2c1b0a99887766554433221100&dn=Sintel.1080p.mkv'
console.log(`Using magnet URI: ${magnetURI}`);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

client.add(magnetURI, { path: __dirname, skipVerify: true, destroyStoreOnDestroy: true }, (torrent) => {
    console.log("✅ Torrent metadata received:");
    console.log(`Torrent name: ${torrent.name}`);
    console.log(`Total files in torrent: ${torrent.files.length}`);

    if (!torrent.files || torrent.files.length === 0) {
        console.error("❌ No files detected in torrent.");
        return;
    }

    torrent.files.forEach((file, index) => {
        console.log(`${index}: 📂 ${file.name}, size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
        file.deselect(); // Deselect all files initially
    });

    rl.question('Enter file indices to download (comma-separated): ', (input) => {
        const selectedIndices = input.split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i));

        if (selectedIndices.length === 0) {
            console.log("❌ No valid files selected. Exiting...");
            client.remove(torrent.infoHash);
            rl.close();
            return;
        }

        torrent.files.forEach((file, index) => {
            if (selectedIndices.includes(index)) {
                file.select(); // Select only desired files
                console.log(`✅ Selected: ${file.name}`);
            }
        });

        rl.close();

        const interval = setInterval(() => {
            console.log(`⏳ Progress: ${(torrent.progress * 100).toFixed(2)}%, Speed: ${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s, Peers: ${torrent.numPeers}`);
        }, 1000);

        torrent.on('done', () => {
            console.log('✅ Download complete');
            clearInterval(interval);
            client.destroy();
        });

        torrent.on('error', (err) => {
            console.error('❌ Torrent download error:', err.message);
        });
    });
});
