const { identifyUserEvent } = require('../../api-util/analytics');
const { integrationSdkInit } = require('../../api-util/scriptManager');
const { USER_TYPES, COMMUNITY_STATUS } = require('../../api-util/metadataHelper');

const MS_IN_SEC = 1000; // (1 second = 1000 ms)
const MS_IN_MINUTE = 60 * MS_IN_SEC; // (1 minutes = 60 seconds) (1 minute = 60*1000 ms)
const POLL_TIMEOUT_LIMIT = 2 * MS_IN_MINUTE; // 2 minute
const POLL_DELAY = 10 * MS_IN_SEC; // 10 seconds

// TOTAL: 2129
const getAllUsers = () => {
  const integrationSdk = integrationSdkInit();
  const params = {
    'fields.user': 'none',
    'fields.listing': 'none',
    'fields.transaction': 'none',
    perPage: 1,
  };
  return integrationSdk.users.query(params);
};

// TOTAL: 42
const getBuyers = page => {
  const integrationSdk = integrationSdkInit();
  const params = {
    pub_userType: USER_TYPES.BUYER,
    page,
  };
  return integrationSdk.users.query(params);
};

// 1555
const getSellers = page => {
  const integrationSdk = integrationSdkInit();
  const params = {
    pub_userType: USER_TYPES.SELLER,
    page,
  };
  return integrationSdk.users.query(params);
};

const getSellerListings = async authorId => {
  const integrationSdk = integrationSdkInit();
  const params = {
    authorId,
    'fields.user': 'none',
    'fields.listing': 'none',
    'fields.transaction': 'none',
    perPage: 1,
  };
  return integrationSdk.listings.query(params);
};

// TOTAL: 532
const getBrandUsers = page => {
  const integrationSdk = integrationSdkInit();
  const params = {
    pub_userType: USER_TYPES.BRAND,
    page,
  };
  return integrationSdk.users.query(params);
};

async function updateBuyers(page) {
  console.warn('[updateBuyers] - START');
  const successList = [];
  const analyzeEvent = async user => {
    const userId = user.id.uuid;
    const { profile, email } = user.attributes;
    const { firstName, lastName } = profile;
    const { userType } = profile.publicData || {};
    const isBuyer = userType === USER_TYPES.BUYER;
    if (isBuyer) {
      const eventUser = { id: userId, email };
      const eventTraits = {
        firstName,
        lastName,
        type: 'BUYER',
        communityUser: 'NO',
        isProdUser: 'YES',
      };
      identifyUserEvent(eventUser, eventTraits);
    }
    return true;
  };
  const pollLoop = async currentPage => {
    console.warn('\n\n\n*******************************');
    let nextPage = currentPage;
    let isLastPage = false;
    const executeWithTimeout = new Promise(async (resolve, reject) => {
      try {
        const sdkUsers = await getBuyers(currentPage);
        const requestMeta = sdkUsers?.data?.meta || {};
        const totalPages = requestMeta.totalPages || 1;
        const users = sdkUsers?.data?.data;
        // console.warn(`--- [pollLoop] - sdkUsers: `, sdkUsers);
        console.warn(`--- [pollLoop] - page ${currentPage} / ${totalPages}`);
        console.warn(`--- [pollLoop] - requestMeta: `, requestMeta);
        // console.warn(`--- [pollLoop] - users: `, users);
        for (const user of users) {
          const userId = user.id.uuid;
          const success = await analyzeEvent(user);
          console.warn(`[analyzeEventsBatch] - userId: ${userId} | success: ${success}`);
          successList.push(userId);
        }
        isLastPage = currentPage === totalPages || currentPage === 100;
        nextPage++;
        resolve(true);
      } catch (err) {
        const error = err?.data?.errors;
        console.error(`--- [pollLoop] | [updateBuyers] - Error:`, error);
        console.error(`--- [pollLoop] | [updateBuyers] - Error:`, err);
        reject(error);
      }
    });
    const pollTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: pollLoop took too long')), POLL_TIMEOUT_LIMIT)
    );
    try {
      await Promise.race([executeWithTimeout, pollTimeout]); // Whichever finishes first
    } catch (error) {
      console.log(`--- [pollLoop] | [updateBuyers] - Restarted due to timeout`);
    }
    const totalItems = successList.length;
    console.warn('\n*******************************\n\n\n');
    console.warn('[updateBuyers] - totalItems:', totalItems);
    if (!isLastPage) {
      console.warn('[updateBuyers] - KEEP GOING');
      setTimeout(() => pollLoop(nextPage), POLL_DELAY);
    } else {
      console.warn('[updateBuyers] - END');
    }
  };
  pollLoop(page);
}

async function updateSellers(page) {
  console.warn('[updateSellers] - START');
  const successList = [];
  const analyzeEvent = async user => {
    const userId = user.id.uuid;
    const { profile, email } = user.attributes;
    const { firstName, lastName } = profile;
    const { userType, creativeSpecialty } = profile.publicData || {};
    const { communityStatus, sellerStatus } = profile.metadata || {};
    const communityStatusApproved = communityStatus === COMMUNITY_STATUS.APPROVED;
    const isSeller = userType === USER_TYPES.SELLER;
    if (isSeller) {
      const sdkListings = await getSellerListings(userId);
      const requestMeta = sdkListings?.data?.meta || {};
      const hasProductListings = requestMeta?.totalItems > 0;
      const creatorType = creativeSpecialty.join(', ');
      const eventUser = { id: userId, email };
      const eventTraits = {
        firstName,
        lastName,
        type: 'CREATOR',
        creatorType,
        sellerStatus,
        hasProductListings: hasProductListings ? 'YES' : 'NO',
        communityUser: communityStatusApproved ? 'YES' : 'NO',
        isProdUser: 'YES',
      };
      identifyUserEvent(eventUser, eventTraits);
    }
    return true;
  };
  const pollLoop = async currentPage => {
    console.warn('\n\n\n*******************************');
    let nextPage = currentPage;
    let isLastPage = false;
    const executeWithTimeout = new Promise(async (resolve, reject) => {
      try {
        const sdkUsers = await getSellers(currentPage);
        const requestMeta = sdkUsers?.data?.meta || {};
        const totalPages = requestMeta.totalPages || 1;
        const users = sdkUsers?.data?.data;
        // console.warn(`--- [pollLoop] - sdkUsers: `, sdkUsers);
        console.warn(`--- [pollLoop] - page ${currentPage} / ${totalPages}`);
        console.warn(`--- [pollLoop] - requestMeta: `, requestMeta);
        // console.warn(`--- [pollLoop] - users: `, users);
        for (const user of users) {
          const userId = user.id.uuid;
          await analyzeEvent(user);
          // const success = await analyzeEvent(user);
          // console.warn(`[analyzeEventsBatch] - userId: ${userId} | success: ${success}`);
          successList.push(userId);
        }
        isLastPage = currentPage === totalPages || currentPage === 100;
        nextPage++;
        resolve(true);
      } catch (err) {
        const error = err?.data?.errors;
        console.error(`--- [pollLoop] | [updateSellers] - Error:`, error);
        console.error(`--- [pollLoop] | [updateSellers] - Error:`, err);
        reject(error);
      }
    });
    const pollTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: pollLoop took too long')), POLL_TIMEOUT_LIMIT)
    );
    try {
      await Promise.race([executeWithTimeout, pollTimeout]); // Whichever finishes first
    } catch (error) {
      console.log(`--- [pollLoop] | [updateSellers] - Restarted due to timeout`);
    }
    const totalItems = successList.length;
    console.warn('\n*******************************\n\n\n');
    console.warn('[updateSellers] - totalItems:', totalItems);
    if (!isLastPage) {
      console.warn('[updateSellers] - KEEP GOING');
      setTimeout(() => pollLoop(nextPage), POLL_DELAY);
    } else {
      console.warn('[updateSellers] - END');
    }
  };
  pollLoop(page);
}

async function updateBrandUsers(page) {
  console.warn('[updateBrandUsers] - START');
  const successList = [];
  const analyzeEvent = async user => {
    const userId = user.id.uuid;
    const { profile, email } = user.attributes;
    const { firstName, lastName } = profile;
    const { userType, brandName } = profile.publicData || {};
    const isBrandUser = userType === USER_TYPES.BRAND;
    if (isBrandUser) {
      const eventUser = { id: userId, email };
      const eventTraits = {
        firstName,
        lastName,
        type: 'BRAND',
        brandCompanyName: brandName,
        isProdUser: 'YES',
      };
      identifyUserEvent(eventUser, eventTraits);
    }
    return true;
  };
  const pollLoop = async currentPage => {
    console.warn('\n\n\n*******************************');
    let nextPage = currentPage;
    let isLastPage = false;
    const executeWithTimeout = new Promise(async (resolve, reject) => {
      try {
        const sdkUsers = await getBrandUsers(currentPage);
        const requestMeta = sdkUsers?.data?.meta || {};
        const totalPages = requestMeta.totalPages || 1;
        const users = sdkUsers?.data?.data;
        // console.warn(`--- [pollLoop] - sdkUsers: `, sdkUsers);
        console.warn(`--- [pollLoop] - page ${currentPage} / ${totalPages}`);
        console.warn(`--- [pollLoop] - requestMeta: `, requestMeta);
        // console.warn(`--- [pollLoop] - users: `, users);
        for (const user of users) {
          const userId = user.id.uuid;
          await analyzeEvent(user);
          successList.push(userId);
        }
        isLastPage = currentPage === totalPages || currentPage === 100;
        nextPage++;
        resolve(true);
      } catch (err) {
        const error = err?.data?.errors;
        console.error(`--- [pollLoop] | [updateBrandUsers] - Error:`, error);
        console.error(`--- [pollLoop] | [updateBrandUsers] - Error:`, err);
        reject(error);
      }
    });
    const pollTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: pollLoop took too long')), POLL_TIMEOUT_LIMIT)
    );
    try {
      await Promise.race([executeWithTimeout, pollTimeout]); // Whichever finishes first
    } catch (error) {
      console.log(`--- [pollLoop] | [updateBrandUsers] - Restarted due to timeout`);
    }
    const totalItems = successList.length;
    console.warn('\n*******************************\n\n\n');
    console.warn('[updateBrandUsers] - totalItems:', totalItems);
    if (!isLastPage) {
      console.warn('[updateBrandUsers] - KEEP GOING');
      setTimeout(() => pollLoop(nextPage), POLL_DELAY);
    } else {
      console.warn('[updateBrandUsers] - END');
    }
  };
  pollLoop(page);
}

const updateSendgridContacts = async (req, res) => {
  try {
    const page = parseInt(req.params.page);
    // const sdkUsers = await getAllUsers();
    // const requestMeta = sdkUsers?.data?.meta || {};
    // console.warn(`--- [updateSendgridContacts] - requestMeta: `, requestMeta);
    // updateBuyers(page);
    // updateSellers(page);
    updateBrandUsers(page);
    res.json({ success: true });
  } catch (error) {
    console.error('[updateSendgridContacts] - ERROR:', error);
    res.status(500).json({ success: false });
  }
};

module.exports = {
  updateSendgridContacts,
};
