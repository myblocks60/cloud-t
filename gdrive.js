import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

console.log('Google Drive upload script started...');

// Read credentials
try {
  console.log('Reading credentials.json...');
  const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
  console.log('Credentials loaded successfully.');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Get file path from command-line argument
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Error: No file path provided.');
    process.exit(1);
  }

  // Configuration flags forwarded from index.js
  const ENABLE_RENAME = process.argv[3] !== 'false'; // defaults to true if not passed
  const FUZZY_RENAME = process.argv[4] === 'true';
  const APPEND_STRING = process.argv[5] || "";
  console.log(`Flags → ENABLE_RENAME: ${ENABLE_RENAME}, FUZZY_RENAME: ${FUZZY_RENAME}, APPEND_STRING: "${APPEND_STRING}"`);

  console.log(`Uploading file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File does not exist at ${filePath}`);
    process.exit(1);
  }

  const fileSize = fs.statSync(filePath).size;
  console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  async function uploadFile() {
    try {
      const originalFileName = path.basename(filePath);
      const ext = path.extname(originalFileName);
      const nameWithoutExt = path.basename(originalFileName, ext);

      // Build filename pieces (left to right)
      const namePieces = [];

      // 1. FUZZY_RENAME → first (e.g. S01E01)
      if (FUZZY_RENAME) {
        const match = originalFileName.match(/[sS]\d+[eE]\d+/);
        if (match) {
          namePieces.push(match[0]);
          console.log(`🔍 Fuzzy match found: ${match[0]}`);
        }
      }

      // 2. APPEND_STRING → after fuzzy
      if (APPEND_STRING && APPEND_STRING.trim() !== "") {
        namePieces.push(APPEND_STRING.trim());
      }

      // 3. ENABLE_RENAME → 5-digit random number at the extreme right
      if (ENABLE_RENAME) {
        const rand5 = String(Math.floor(10000 + Math.random() * 90000)); // 10000–99999
        namePieces.push(rand5);
      }

      // If no pieces were added, fall back to original name
      let uploadName = namePieces.length > 0
        ? namePieces.join('_') + ext
        : nameWithoutExt + ext;

      console.log(`Original name: ${originalFileName}`);
      console.log(`Final upload name: ${uploadName}`);

      const fileMetadata = {
        name: uploadName,
        parents: [process.env.DRIVE_FOLDER_ID], // Reads from .env
      };

      const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(filePath),
      };

      console.log(`Starting upload for ${uploadName}...`);

      const res = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });

      console.log(`Upload complete for ${uploadName}! File ID: ${res.data.id}`);
      console.log(`📝 Mapping: ${originalFileName} → ${uploadName}`);
    } catch (error) {
      console.error(`Error uploading ${filePath}:`, error.message);
    }
  }

  uploadFile();
} catch (err) {
  console.error('Fatal error in gdrive.js:', err.message);
  process.exit(1);
}
