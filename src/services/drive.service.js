const { google } = require('googleapis');
const { Readable } = require('stream');
const config = require('../config/config');

const getAuthClient = () => {
  const key = config.google.serviceAccountKey;
  if (!key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not configured');
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
};

/**
 * Uploads a .docx Buffer to Google Drive and returns a shareable view URL.
 */
const uploadDocx = async (fileBuffer, fileName, folderId) => {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      parents: folderId ? [folderId] : [],
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(fileBuffer),
    },
    fields: 'id',
  });

  const fileId = uploadRes.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
};

module.exports = { uploadDocx };
