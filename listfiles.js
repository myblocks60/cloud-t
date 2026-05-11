import WebTorrent from 'webtorrent';

// ─── Paste your magnet URI here ──────────────────────────────────────────────
const magnetURI = 'magnet:?xt=urn:btih:6b8d9f7c5a4e3d2c1b0a99887766554433221100&dn=Sintel.1080p.mkv';
// ─────────────────────────────────────────────────────────────────────────────

console.log('🔍 Fetching torrent metadata...');
console.log('   (This only downloads the file list, NOT the actual files)\n');

const client = new WebTorrent();

// Timeout after 60 seconds if metadata never arrives
const timeout = setTimeout(() => {
    console.error('❌ Timed out after 60 seconds. Could not fetch torrent metadata.');
    client.destroy();
    process.exit(1);
}, 60000);

client.add(magnetURI, { path: '/dev/null' }, (torrent) => {
    clearTimeout(timeout);

    // Deselect all files immediately so nothing actually downloads
    torrent.files.forEach(f => f.deselect());
    torrent.deselect(0, torrent.pieces.length - 1, false);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Torrent : ${torrent.name}`);
    console.log(`📁 Files   : ${torrent.files.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Header
    const idxWidth = String(torrent.files.length).length;
    console.log(`${'#'.padStart(idxWidth)}  ${'Size'.padStart(10)}  File Name`);
    console.log(`${'─'.repeat(idxWidth)}  ${'─'.repeat(10)}  ${'─'.repeat(50)}`);

    // List each file
    torrent.files.forEach((file, idx) => {
        const fileNum = String(idx + 1).padStart(idxWidth);
        const sizeMB = (file.length / 1024 / 1024).toFixed(2).padStart(9) + 'M';
        console.log(`${fileNum}  ${sizeMB}  ${file.name}`);
    });

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`💡 Use FILE_RANGE in index.js to download specific files.`);
    console.log(`   e.g. FILE_RANGE = "3-5" to download files #3 through #5.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    client.destroy();
    process.exit(0);
});

client.on('error', (err) => {
    clearTimeout(timeout);
    console.error(`❌ Error: ${err.message}`);
    client.destroy();
    process.exit(1);
});
