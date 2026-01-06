/**
 * Removes the word "luupe" (case-insensitive) from a string, including surrounding spaces.
 * Handles word boundaries to avoid removing "luupe" from within other words.
 *
 * @param {string} text - Text to sanitize
 * @returns {string} - Text with "luupe" and surrounding spaces removed (case-insensitive)
 */
function removeLuupeWord(text) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }
  // Use word boundary regex to match "luupe" as a whole word, case-insensitive
  // \s* matches zero or more whitespace before and after the word
  // \b ensures we match word boundaries, gi flags for global and case-insensitive
  // This removes "luupe" and any surrounding spaces
  return text.replace(/\s*\bluupe\b\s*/gi, ' ').trim();
}

/**
 * Sanitizes a string by removing "luupe" and cleaning up extra whitespace.
 * Removes multiple spaces and trims the result.
 *
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }
  const withoutLuupe = removeLuupeWord(text);
  // Clean up multiple spaces and trim
  return withoutLuupe.replace(/\s+/g, ' ').trim();
}

module.exports = {
  removeLuupeWord,
  sanitizeText,
};
