const axios = require('axios');

const BASE_PATH = 'api/v1/management';
// The lookup and the brand's name run while a person waits: on a redirect after their Auth0
// login, or on a brand's invitation page.
const LOOKUP_TIMEOUT_MS = 5000;
// The joins run during sign-up, with the Confirm button spinning (spec/v0/login-and-registration.md
// §4.5.1).
const JOIN_TIMEOUT_MS = 20000;
const STUDIO_USER_TYPE = {
  CREATOR: 'CREATOR',
  BRAND: 'BRAND',
};

class StudioManagerClient {
  axiosClient = axios.create({
    baseURL: `${process.env.WEBAPI_URL}/${BASE_PATH}`,
    timeout: 45000, // 45 seconds timeout
  });

  constructor() {
    this.axiosClient.interceptors.request.use(
      async config => {
        const apiKey = process.env.STUDIO_MANAGER_API_KEY;
        config.headers.set('x-api-key', apiKey);
        return config;
      },
      error => Promise.reject(error)
    );

    // Logs only the method, the path, and the webapp's status and answer (or the error's message
    // when there's none). Never `error.config`, `error.request` or headers: they carry the
    // x-api-key (spec/v0/login-and-registration.md §10.2.4). A failed call becomes an empty answer
    // that keeps the status, so a caller can tell a 404 from a failure (`getBrand`).
    this.axiosClient.interceptors.response.use(response => response, function(error) {
      const { method = '', url = '' } = error.config || {};
      const request = `${method.toUpperCase()} ${url}`;
      if (error.response) {
        console.error(
          `StudioManagerClient Error: ${request} | status: ${error.response.status} | data:`,
          error.response.data
        );
      } else {
        console.error(`StudioManagerClient Error: ${request} | ${error.message}`);
      }
      return { data: {}, status: error.response?.status };
    });
  }

  // The joins answer `success`: the webapp refuses some joins on purpose (`POST /brand` for a known
  // email that isn't a brand's admin), and a refusal must never pass for a join
  // (webapp/spec/marketplace-login-and-registration.md §2.3). `companyName` is the brand's name in
  // the webapp, which wins over the one sent.
  async addStudioBrand(data) {
    const result = await this.axiosClient.post(`/brand`, data, { timeout: JOIN_TIMEOUT_MS });
    const { brandStudioId, communityId, studioId, companyName } = result?.data?.data || {};
    return {
      success: result?.data?.success === true,
      brandStudioId,
      communityId,
      studioId,
      companyName,
    };
  }

  async addStudioBrandUser(brandStudioId, data) {
    const result = await this.axiosClient.post(
      `/brand/${encodeURIComponent(brandStudioId)}/user`,
      data,
      { timeout: JOIN_TIMEOUT_MS }
    );
    const { communityId, studioId, isBrandAdmin, companyName } = result?.data?.data || {};
    return {
      success: result?.data?.success === true,
      communityId,
      studioId,
      isBrandAdmin,
      companyName,
    };
  }

  async studioBrandUserInit(brandStudioId, data) {
    if (!brandStudioId) {
      return await this.addStudioBrand(data);
    }
    return await this.addStudioBrandUser(brandStudioId, data.admin);
  }

  // The webapp user with this email, ignoring case: { id, type, brandId, companyName, isBrandAdmin,
  // loginMatches }, or null. `loginMatches` says whether `providerId`, the Auth0 id of the login
  // being handled, is theirs (webapp/spec/marketplace-login-and-registration.md §2.1). A failed
  // call reads as null (the interceptor answers { data: {} }).
  async lookupUser(email, providerId) {
    const result = await this.axiosClient.post(
      `/user/lookup`,
      { email, providerId },
      { timeout: LOOKUP_TIMEOUT_MS }
    );
    return result?.data?.data?.user || null;
  }

  // The brand's { id, companyName }, or null when the webapp doesn't know the id (404). Throws when
  // the webapp can't answer, so a failure never reads as an invalid invitation
  // (webapp/spec/marketplace-login-and-registration.md §2.2). The id comes from a URL.
  async getBrand(brandId) {
    const result = await this.axiosClient.get(`/brand/${encodeURIComponent(brandId)}`, {
      timeout: LOOKUP_TIMEOUT_MS,
    });
    if (result?.data?.success === true) return result.data.data?.brand || null;
    if (result?.status === 404) return null;
    throw new Error(`The webapp couldn't be asked for brand ${brandId}`);
  }

  // Joins the webapp user (`studioId`) to the community, or answers the id they already have
  // (webapp/spec/marketplace-login-and-registration.md §2.5). null when the call fails.
  async addUserToCommunity(studioId) {
    const result = await this.axiosClient.post(`/user/${encodeURIComponent(studioId)}/community`);
    return result?.data?.success === true ? result.data.data?.communityId || null : null;
  }

  // The three updates below answer whether the webapp took the change: a failed call reads as
  // false, so the event job can send its alert (spec/v0/login-and-registration.md §9.4.3).
  async studioBrandUpdate(brandId, data) {
    const result = await this.axiosClient.put(`/brand/${brandId}`, data);
    return result?.data?.success === true;
  }

  async studioUserUpdate(userId, data) {
    const result = await this.axiosClient.put(`/user/${userId}`, data);
    return result?.data?.success === true;
  }

  async studioCreatorInit(data) {
    const result = await this.axiosClient.post(`/creator`, data);
    const { communityId, studioId } = result?.data?.data || {};
    return {
      communityId,
      studioId,
    };
  }

  async creatorProfileListingUpdate(userId, data) {
    const result = await this.axiosClient.put(`/user/${userId}/creator`, data);
    return result?.data?.success === true;
  }

  async getScriptSequence(scriptName) {
    const result = await this.axiosClient.get(`/sequence/${scriptName}`);
    const { success, sequenceId } = result?.data || {};
    return { success, sequenceId };
  }
  async updateScriptSequence(scriptName, data) {
    const result = await this.axiosClient.put(`/sequence/${scriptName}`, data);
    const { success, sequenceId } = result?.data || {};
    return { success, sequenceId };
  }
}

module.exports = {
  StudioManagerClient,
  STUDIO_USER_TYPE,
};
