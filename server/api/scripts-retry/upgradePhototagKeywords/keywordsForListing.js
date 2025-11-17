const axios = require('axios');
const FormData = require('form-data');

const {
  sanitizeFilename,
  extractExcludedWords,
  DEFAULT_FILENAME,
  PHOTOTAG_MAX_KEYWORDS,
} = require('../../phototag-keywords');

const DEFAULT_CONTENT_TYPE = 'image/jpeg';
const IMAGE_REQUEST_TIMEOUT = 60000;

async function fetchImageBuffer(imageUrl) {
  const response = await axios({
    method: 'GET',
    url: imageUrl,
    responseType: 'arraybuffer',
    timeout: IMAGE_REQUEST_TIMEOUT,
  });
  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type'] || DEFAULT_CONTENT_TYPE,
  };
}

module.exports = async function keywordsForListing({ author, imageUrl, filename, contentType }) {
  if (!imageUrl) {
    throw new Error('missingImageUrl');
  }
  const apiKey = process.env.PHOTOTAG_API_KEY;
  if (!apiKey) {
    throw new Error('missingPhototagApiKey');
  }
  const profile = author?.attributes?.profile || {};
  const excludedWords = extractExcludedWords(profile);
  const excludedKeywords = excludedWords.join(',');
  const sanitizedFilename = sanitizeFilename(filename || DEFAULT_FILENAME, excludedWords);
  const withFototagLogs = false;

  if (withFototagLogs) {
    console.warn('\n\n\n--------------------------------');
    console.warn('\n[keywordsForListing] - filename:', filename);
    console.warn('\n[keywordsForListing] - contentType:', contentType);
    console.warn('\n[keywordsForListing] - imageUrl:', imageUrl);
    console.warn('\n[keywordsForListing] - excludedWords:', excludedWords);
    console.warn('\n[keywordsForListing] - excludedKeywords:', excludedKeywords);
    console.warn('\n[keywordsForListing] - sanitizedFilename:', sanitizedFilename);
    console.warn('\n--------------------------------\n\n\n');
  }

  try {
    const { buffer, contentType: resolvedContentType } = await fetchImageBuffer(imageUrl);
    const form = new FormData();
    form.append('keywordsOnly', 'true');
    form.append('language', 'en');
    form.append('useFileNameForContext', 'true');
    form.append('excludedKeywords', excludedKeywords);
    form.append('singleWordKeywordsOnly', 'true');
    form.append('maxKeywords', PHOTOTAG_MAX_KEYWORDS);
    form.append('file', buffer, {
      filename: sanitizedFilename,
      contentType: resolvedContentType || contentType || DEFAULT_CONTENT_TYPE,
    });
    const url = process.env.PHOTOTAG_API_URL || 'https://server.phototag.ai/api/keywords';
    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    };
    const response = await axios.post(url, form, { headers });
    return response?.data?.data || {};
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data || { error: 'phototagRequestFailed' };
    if (status === 500 && message.error === 'Failed to generate results') {
      return { keywords: [] };
    }
    throw error;
  }
};
