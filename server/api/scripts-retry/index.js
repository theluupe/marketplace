const retryBrandUserAssignment = require('./retryBrandUserAssignment');
const retryProductListingCreated = require('./retryProductListingCreated');
const retryUserCreated = require('./retryUserCreated');
const upgradePhototagKeywordsScript = require('./upgradePhototagKeywords/index');
const normalizeKeywordsScript = require('./normalizeKeywords/index');
const sanitizeListingDataScript = require('./sanitizeListingData/index');

module.exports = {
  ...retryBrandUserAssignment,
  ...retryProductListingCreated,
  ...retryUserCreated,
  ...upgradePhototagKeywordsScript,
  ...normalizeKeywordsScript,
  ...sanitizeListingDataScript,
};
