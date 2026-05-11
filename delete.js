import { google } from 'googleapis';
import fs from 'fs';

// Authenticate using service account
const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Function to list and delete all files
async function deleteAllFiles() {
  try {
    // List all files
    const res = await drive.files.list({
      fields: 'files(id, name)',
    });

    const files = res.data.files;

    if (!files.length) {
      console.log('✅ No files found in service account storage.');
      return;
    }

    console.log(`⚠️ Found ${files.length} files. Deleting them now...`);

    // Delete each file
    for (const file of files) {
      try {
        await drive.files.delete({ fileId: file.id });
        console.log(`🗑️ Deleted: ${file.name} (${file.id})`);
      } catch (deleteError) {
        console.error(`❌ Failed to delete ${file.name}:`, deleteError.message);
      }
    }

    console.log('✅ All files deleted successfully!');
  } catch (error) {
    console.error('❌ Error fetching files:', error.message);
  }
}

// Run the delete function
deleteAllFiles();
