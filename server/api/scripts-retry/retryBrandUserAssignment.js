const { integrationSdkInit } = require('../../api-util/scriptManager');
const { USER_TYPES } = require('../../api-util/metadataHelper');
const {
  EVENT_TYPES,
  RESOURCE_TYPE,
  analyzeEvent,
} = require('../../scripts/events/notifyUserCreated');

const QUERY_PARAMS = { expand: true };

const filterEvents = async userId => {
  try {
    const integrationSdk = integrationSdkInit();
    const result = await integrationSdk.users.show({ id: userId }, QUERY_PARAMS);
    const resource = result?.data?.data;
    const resourceId = resource?.id;
    const event = {
      attributes: {
        resourceType: RESOURCE_TYPE,
        eventType: EVENT_TYPES,
        resource,
        resourceId,
      },
    };
    return event;
  } catch (error) {
    return null;
  }
};

async function validateBrand(brandStudioId) {
  const integrationSdk = integrationSdkInit();
  const response = await integrationSdk.users.query(
    {
      priv_brandStudioId: brandStudioId,
      meta_isBrandAdmin: true,
    },
    QUERY_PARAMS
  );
  const data = response.data.data;
  const brandFound = data.length > 0;
  return !!brandFound;
}

const retryBrandUserAssignmentScript = async (req, res) => {
  const { brandStudioId, userId } = req.params;
  try {
    const event = await filterEvents(userId);
    if (!event) {
      return res.json({
        success: false,
        message: `User '${userId}' does not exist`,
      });
    }

    const brandFound = await validateBrand(brandStudioId);
    if (!brandFound) {
      return res.json({
        success: false,
        message: `Brand '${brandStudioId}' does not exist`,
      });
    }

    const user = event.attributes.resource;
    const { profile } = user.attributes;
    const { userType } = profile.publicData;
    const { brandStudioId: userBrandStudioId } = profile.privateData;

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

    const integrationSdk = integrationSdkInit();
    await integrationSdk.users.updateProfile({
      id: userId,
      publicData: {
        userType: USER_TYPES.BRAND,
      },
      privateData: {
        brandStudioId: brandStudioId,
      },
    });
    const richEvent = event;
    richEvent.attributes.resource.attributes.profile.publicData.userType = USER_TYPES.BRAND;
    richEvent.attributes.resource.attributes.profile.privateData.brandStudioId = brandStudioId;
    await analyzeEvent(event);
    res.json({ success: true });
  } catch (error) {
    console.warn(`[retryBrandUserAssignmentScript] - Error:`, error);
    res.json({ success: false });
  }
};

module.exports = {
  retryBrandUserAssignmentScript,
};
