const axios = require('axios');
const FormData = require('form-data');

const { getSdk } = require('../api-util/sdk');

const DEFAULT_EXCLUDED_WORDS = ['luupe'];
const DEFAULT_FILENAME = 'listing-image.jpg';
const PHOTOTAG_MAX_KEYWORDS = 40;

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractExcludedWords(profile = {}) {
  const { displayName, firstName, lastName } = profile;
  const nameCandidates = [displayName, firstName, lastName];
  const words = nameCandidates
    .filter(Boolean)
    .map(name => name.split(/\s+/))
    .flat()
    .map(word => word.trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  const excludedWords = [...DEFAULT_EXCLUDED_WORDS, ...words];
  excludedWords.forEach(word => {
    const normalized = word.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(word);
    }
  });
  return unique;
}

function sanitizeFilename(originalFilename, excludedWords = []) {
  const trimmed = (originalFilename || '').trim();
  const hasFilename = !!trimmed;
  const fallbackFilename = hasFilename ? trimmed : DEFAULT_FILENAME;
  const lastDotIndex = fallbackFilename.lastIndexOf('.');
  let base = fallbackFilename;
  let extension = '';
  if (lastDotIndex !== -1) {
    base = fallbackFilename.slice(0, lastDotIndex);
    extension = fallbackFilename.slice(lastDotIndex);
  }
  let sanitizedBase = base;
  if (excludedWords.length) {
    const excludedSet = new Set(excludedWords.map(word => word.toLowerCase()));
    const tokens = base.split(/([A-Za-z0-9]+)/);
    sanitizedBase = tokens
      .map(token => {
        if (/^[A-Za-z0-9]+$/.test(token) && excludedSet.has(token.toLowerCase())) {
          return '';
        }
        return token;
      })
      .join('');
  }
  sanitizedBase = sanitizedBase.replace(/[^A-Za-z0-9._-]+/g, '_');
  sanitizedBase = sanitizedBase.replace(/_+/g, '_');
  const sanitizedExtension = extension.replace(/[^A-Za-z0-9._-]+/g, '_');
  const result = `${sanitizedBase}${sanitizedExtension}`.replace(/_\./g, '.');
  const trimmedResult = result.trim();
  return trimmedResult || DEFAULT_FILENAME;
}

module.exports = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const currentUserResponse = await sdk.currentUser.show();
    const currentUser = currentUserResponse.data.data;
    const currentUserId = currentUser?.id?.uuid;
    const { file } = req.body || {};

    if (!currentUserId) {
      return res.status(401).json({
        error: 'unauthenticatedUser',
      });
    }

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

    const profile = currentUser?.attributes?.profile || {};
    const excludedWords = extractExcludedWords(profile);
    const excludedKeywords = excludedWords.join(',');
    const sanitizedFilename = sanitizeFilename(filename || DEFAULT_FILENAME, excludedWords);
    const useDevApiServer = process.env.NODE_ENV === 'development';
    let data = {};
    if (!useDevApiServer) {
      await timeout(1000);
      data = {
        keywords: [
          'keyword1',
          'keyword2',
          'keyword3',
          'keyword1',
          'keyword2',
          'keyword3',
          'keyword4',
        ],
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
      form.append('maxKeywords', PHOTOTAG_MAX_KEYWORDS);
      form.append('file', buffer, {
        filename: sanitizedFilename,
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

module.exports.DEFAULT_FILENAME = DEFAULT_FILENAME;
module.exports.PHOTOTAG_MAX_KEYWORDS = PHOTOTAG_MAX_KEYWORDS;
module.exports.sanitizeFilename = sanitizeFilename;
module.exports.extractExcludedWords = extractExcludedWords;
module.exports.timeout = timeout;
