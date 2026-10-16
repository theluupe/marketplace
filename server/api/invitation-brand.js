const log = require('../log.js');
const { StudioManagerClient } = require('../api-util/studioHelper');

// An invitation link's brand, for its page: the brand's name, or 404 for an id the webapp doesn't
// know (spec/v0/login-and-registration.md §4.5.2). Public: the brand id is the invitation, so
// whoever holds the link learns nothing new. A webapp failure is a 502, never a 404, so it never
// reads as an invalid link.
module.exports = async (req, res) => {
  try {
    const brand = await new StudioManagerClient().getBrand(req.params.brandStudioId);
    if (!brand) {
      return res
        .status(404)
        .json({ name: 'BrandNotFound' })
        .end();
    }
    return res
      .status(200)
      .json({ companyName: brand.companyName })
      .end();
  } catch (e) {
    log.error(e, 'invitation-brand-failed');
    return res
      .status(502)
      .json({ name: 'BrandLookupFailed' })
      .end();
  }
};
