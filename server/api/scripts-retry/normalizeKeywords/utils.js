/**
 * Deduplicates keywords array, case-insensitive comparison.
 * Converts all keywords to lowercase and trims whitespace.
 * Filters out empty strings.
 *
 * @param {string[]|string} keywords - Keywords as array or comma-separated string
 * @returns {string[]} - Deduplicated keywords array in lowercase
 */
function deduplicateKeywords(keywords) {
  if (!keywords) {
    return [];
  }
  // Convert to array if string
  const keywordsArray = Array.isArray(keywords)
    ? keywords
    : typeof keywords === 'string'
    ? keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
    : [];
  // Use a Map to track seen keywords (case-insensitive)
  const seen = new Map();
  const result = [];
  keywordsArray.forEach(keyword => {
    const trimmed = keyword.trim();
    if (trimmed.length === 0) {
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (!seen.has(normalized)) {
      seen.set(normalized, true);
      result.push(normalized);
    }
  });
  return result;
}

/**
 * Parses keywords from a string (space-separated or comma-separated)
 * @param {string} keywordsString - Keywords as string
 * @returns {string[]} - Array of keywords
 */
function parseKeywords(keywordsString) {
  if (!keywordsString || typeof keywordsString !== 'string') {
    return [];
  }
  return keywordsString
    .split(/\s+|,/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

module.exports = {
  deduplicateKeywords,
  parseKeywords,
};
