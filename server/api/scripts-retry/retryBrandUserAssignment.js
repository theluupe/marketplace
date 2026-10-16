const { integrationSdkInit } = require('../../api-util/scriptManager');
const { joinBrand } = require('../../api-util/brandJoin');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const { StudioManagerClient } = require('../../api-util/studioHelper');

const QUERY_PARAMS = { expand: true };
const NO_RESPONSE = "Couldn't assign: the platform didn't respond. Try again.";

// The webapp's "Assign an existing buyer to a brand" (spec/v0/login-and-registration.md §7.4):
// `POST /scrips-retry/brandUserAssignment/:brandStudioId/:userId`, behind the API key. Answers
// `{ success, message? }`, and the webapp shows the message when it fails.
const retryBrandUserAssignmentScript = async (req, res) => {
  const { brandStudioId, userId } = req.params;
  try {
    const integrationSdk = integrationSdkInit();
    const user = await integrationSdk.users
      .show({ id: userId }, QUERY_PARAMS)
      .then(response => response?.data?.data)
      .catch(() => null);
    if (!user) {
      return res.json({
        success: false,
        message: `User '${userId}' does not exist`,
      });
    }

    // The webapp has the brand, whether or not its admin is on the Marketplace (§7.4, decision 1).
    // A failed check isn't an unknown brand.
    let brand;
    try {
      brand = await new StudioManagerClient().getBrand(brandStudioId);
    } catch (error) {
      console.warn(`[retryBrandUserAssignmentScript] - Error:`, error?.message);
      return res.json({ success: false, message: NO_RESPONSE });
    }
    if (!brand) {
      return res.json({
        success: false,
        message: `Brand '${brandStudioId}' does not exist`,
      });
    }

    const { profile } = user.attributes;
    const { userType } = profile.publicData || {};
    const { brandStudioId: userBrandStudioId } = profile.privateData || {};

    const isBrand = !!userBrandStudioId || userType === USER_TYPES.BRAND;
    if (isBrand) {
      if (userBrandStudioId === brandStudioId) {
        return res.json({
          success: false,
          message: `User '${userId}' already belongs to the brand '${brandStudioId}'`,
        });
      }
      return res.json({
        success: false,
        message: `User '${userId}' already belongs to another brand. Reach out to support to be added to this brand.`,
      });
    }

    const isSeller = userType === USER_TYPES.SELLER;
    if (isSeller) {
      return res.json({
        success: false,
        message: `User '${userId}' is a seller and cannot be assigned to a brand. Reach out to support to be added to this brand.`,
      });
    }

    const { studioId } = profile.metadata || {};
    const withStudioAccess = !!studioId;
    if (withStudioAccess) {
      return res.json({
        success: false,
        message: `User '${userId}' already has studio access and cannot be assigned to a brand. Reach out to support to be added to this brand.`,
      });
    }

    // The sign-up's join, not the job's sign-up handler: no second referral step or Segment
    // identify (§7.4, decision 2). It writes the type and the brand only when it works, so a
    // failure leaves the buyer as they were, and says so (decision 3). In a brand with no admin at
    // all, the webapp gives them the seat (decision 6).
    const joined = await joinBrand(userId, brandStudioId);
    if (!joined) {
      return res.json({ success: false, message: NO_RESPONSE });
    }
    res.json({ success: true });
  } catch (error) {
    console.warn(`[retryBrandUserAssignmentScript] - Error:`, error);
    res.json({ success: false, message: NO_RESPONSE });
  }
};

module.exports = {
  retryBrandUserAssignmentScript,
};
