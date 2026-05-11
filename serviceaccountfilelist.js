import { google } from 'googleapis';
import fs from 'fs';

// Authenticate using service account
const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// List files uploaded by the service account
async function listFiles() {
  try {
    const res = await drive.files.list({
      fields: 'files(id, name)',
    });
    console.log('Files stored in the service account Drive:');
    res.data.files.forEach(file => console.log(`${file.name} (${file.id})`));
  } catch (error) {
    console.error('Error listing files:', error.message);
  }
}

listFiles();


