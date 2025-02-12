const axios = require('axios');
const axiosRetry = require('axios-retry').default;

const ASSET_UPLOAD_URL = '/assets/marketplace/original';

class StorageManagerClient {
  client = axios.create({
    baseURL: `${process.env.STORAGE_MANAGER_URL}/api`,
    timeout: 180000, // 3 minutes timeout
  });

  constructor() {
    this.client.interceptors.request.use(config => {
      config.headers['x-api-key'] = process.env.STORAGE_MANAGER_API_KEY;
      return config;
    }, Promise.reject);
    axiosRetry(this.client, {
      retries: 3, // Retry each request up to 3 times
      retryDelay: retryCount => {
        return retryCount * 1500;
      },
      retryCondition: () => true,
    });
  }

  async uploadOriginalAssets(data) {
    try {
      const response = await this.client.post(ASSET_UPLOAD_URL, { data });
      return response.data;
    } catch (error) {
      const parsedError = error?.response?.data || '';
      console.error(
        `[StorageManagerClient] | Failed to upload original asset | Error : ${parsedError}`
      );
      throw error;
    }
  }
}

module.exports = {
  StorageManagerClient,
};
