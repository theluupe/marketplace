const axios = require('axios');
const FormData = require('form-data');

const { getSdk } = require('../api-util/sdk');

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const currentUserResponse = await sdk.currentUser.show();
    const currentUser = currentUserResponse.data.data;
    const currentUserId = currentUser?.id?.uuid;
    const { displayName } = currentUser?.attributes?.profile || {};
    const excludedKeywords = displayName.split(' ').join(',');

    if (!currentUserId) {
      return res.status(401).json({
        error: 'unauthenticatedUser',
      });
    }

    const { file } = req.body || {};
    if (!file) {
      return res.status(400).json({ error: 'missingFile' });
    }

    const { data: base64Data, filename, contentType } = file;
    if (!base64Data || base64Data.length === 0) {
      return res.status(400).json({ error: 'emptyBase64Data' });
    }

    const apiKey = process.env.PHOTOTAG_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'missingPhototagApiKey' });
    }

    const useDevApiServer = process.env.NODE_ENV === 'development';
    let data = {};
    if (useDevApiServer) {
      await timeout(3000);
      data = {
        keywords: ['keyword1', 'keyword2', 'keyword3'],
        title: 'title NICE',
        description: 'description AWESOME',
      };
    } else {
      const buffer = Buffer.from(base64Data, 'base64');
      const form = new FormData();
      form.append('language', 'en');
      form.append('useFileNameForContext', 'true');
      form.append('excludedKeywords', excludedKeywords);
      form.append('singleWordKeywordsOnly', 'true');
      form.append('maxKeywords', 40);
      form.append('file', buffer, {
        filename: filename || 'image.jpg',
        contentType: contentType || 'image/jpeg',
      });
      const url = process.env.PHOTOTAG_API_URL || 'https://server.phototag.ai/api/keywords';
      const headers = {
        ...form.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      };
      const response = await axios.post(url, form, { headers });
      data = response?.data?.data || {};
    }

    return res.status(200).json(data);
  } catch (err) {
    const status = err?.response?.status || 500;
    const message = err?.response?.data || { error: 'phototagRequestFailed' };
    return res.status(status).json(message);
  }
};
