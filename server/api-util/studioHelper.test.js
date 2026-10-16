const util = require('util');
const axios = require('axios');
const { StudioManagerClient } = require('./studioHelper');

describe('StudioManagerClient.lookupUser', () => {
  const answeredWith = response => {
    const client = new StudioManagerClient();
    client.axiosClient.post = jest.fn().mockResolvedValue(response);
    return client;
  };

  it("posts the email and the login's Auth0 id with a short timeout, and returns the webapp user", async () => {
    const user = {
      id: 'user-1',
      type: 'BRAND',
      brandId: 'brand-1',
      companyName: 'Acme',
      isBrandAdmin: true,
      loginMatches: true,
    };
    const client = answeredWith({ data: { success: true, data: { user } } });

    await expect(client.lookupUser('jo@example.com', 'auth0|jo')).resolves.toEqual(user);
    expect(client.axiosClient.post).toHaveBeenCalledWith(
      '/user/lookup',
      { email: 'jo@example.com', providerId: 'auth0|jo' },
      { timeout: 5000 }
    );
  });

  it.each([
    ['nobody', { data: { success: true, data: { user: null } } }],
    ["a failed call (the interceptor's answer)", { data: {} }],
  ])('returns null for %s', async (_, response) => {
    await expect(answeredWith(response).lookupUser('jo@example.com')).resolves.toBeNull();
  });
});

describe('StudioManagerClient.addStudioBrandUser', () => {
  const answeredWith = data => {
    const client = new StudioManagerClient();
    client.axiosClient.post = jest.fn().mockResolvedValue({ data: { success: true, data } });
    return client;
  };

  it("passes the webapp's isBrandAdmin and companyName through", async () => {
    const client = answeredWith({
      communityId: 'community-1',
      studioId: 'studio-1',
      isBrandAdmin: true,
      companyName: 'Acme',
    });

    const result = await client.addStudioBrandUser('brand-1', { email: 'jo@example.com' });

    expect(client.axiosClient.post).toHaveBeenCalledWith(
      '/brand/brand-1/user',
      { email: 'jo@example.com' },
      { timeout: 20000 }
    );
    expect(result).toEqual({
      success: true,
      communityId: 'community-1',
      studioId: 'studio-1',
      isBrandAdmin: true,
      companyName: 'Acme',
    });
  });

  it('returns no flag when the webapp sends none (a webapp without the change)', async () => {
    const client = answeredWith({ communityId: 'community-1', studioId: 'studio-1' });

    const result = await client.addStudioBrandUser('brand-1', {});

    expect(result.isBrandAdmin).toBeUndefined();
    expect(result).toMatchObject({ communityId: 'community-1', studioId: 'studio-1' });
  });
});

describe("StudioManagerClient's updates", () => {
  const answeredWith = response => {
    const client = new StudioManagerClient();
    client.axiosClient.put = jest.fn().mockResolvedValue(response);
    return client;
  };

  it.each([
    ['studioBrandUpdate', '/brand/id-1'],
    ['studioUserUpdate', '/user/id-1'],
    ['creatorProfileListingUpdate', '/user/id-1/creator'],
  ])('%s answers whether the webapp took the change', async (method, path) => {
    const worked = answeredWith({ data: { success: true } });
    await expect(worked[method]('id-1', {})).resolves.toBe(true);
    expect(worked.axiosClient.put).toHaveBeenCalledWith(path, {});

    // A failed call: the interceptor's empty answer.
    await expect(answeredWith({ data: {} })[method]('id-1', {})).resolves.toBe(false);
  });
});

describe("StudioManagerClient's phase 3 calls", () => {
  // Through the real interceptors; only the network is replaced.
  const webappAnswers = (status, data) => {
    const client = new StudioManagerClient();
    client.axiosClient.defaults.adapter = config =>
      status < 400
        ? Promise.resolve({ status, data, headers: {}, config, statusText: '' })
        : Promise.reject(
            new axios.AxiosError(
              'failed',
              'ERR_BAD_RESPONSE',
              config,
              {},
              {
                status,
                data,
                headers: {},
                config,
              }
            )
          );
    return client;
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it("getBrand answers the brand, or null for an id the webapp doesn't know", async () => {
    const brand = { id: 'brand-1', companyName: 'Acme' };
    await expect(
      webappAnswers(200, { success: true, data: { brand } }).getBrand('brand-1')
    ).resolves.toEqual(brand);
    await expect(webappAnswers(404, { success: false }).getBrand('nope')).resolves.toBeNull();
  });

  it('getBrand throws when the webapp fails, so a failure never reads as an invalid link', async () => {
    await expect(webappAnswers(500, { success: false }).getBrand('brand-1')).rejects.toThrow();
  });

  it('getBrand and the join keep a brand id from a URL inside its path segment', async () => {
    const client = webappAnswers(404, { success: false });
    const requested = [];
    const adapter = client.axiosClient.defaults.adapter;
    client.axiosClient.defaults.adapter = config => {
      requested.push(config.url);
      return adapter(config);
    };

    await client.getBrand('../user/x');
    await client.addStudioBrandUser('../user/x', {});

    expect(requested).toEqual(['/brand/..%2Fuser%2Fx', '/brand/..%2Fuser%2Fx/user']);
  });

  it('addUserToCommunity answers the community id, or null when the call fails', async () => {
    await expect(
      webappAnswers(200, { success: true, data: { communityId: -7 } }).addUserToCommunity('u-1')
    ).resolves.toBe(-7);
    await expect(
      webappAnswers(500, { success: false }).addUserToCommunity('u-1')
    ).resolves.toBeNull();
  });

  it("addStudioBrand reports POST /brand's refusal, and passes the brand's webapp name", async () => {
    await expect(
      webappAnswers(500, { success: false }).addStudioBrand({ companyName: 'Acme' })
    ).resolves.toEqual({ success: false });
    await expect(
      webappAnswers(200, {
        success: true,
        data: { brandStudioId: 'brand-1', studioId: 'user-1', companyName: 'Acme Inc' },
      }).addStudioBrand({ companyName: 'Acme' })
    ).resolves.toEqual({
      success: true,
      brandStudioId: 'brand-1',
      studioId: 'user-1',
      companyName: 'Acme Inc',
    });
  });
});

describe('StudioManagerClient, a failed call', () => {
  const API_KEY = 'the-management-key';
  const savedKey = process.env.STUDIO_MANAGER_API_KEY;

  beforeEach(() => {
    process.env.STUDIO_MANAGER_API_KEY = API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    process.env.STUDIO_MANAGER_API_KEY = savedKey;
  });

  // The request goes through both real interceptors; only the network is replaced.
  const failingWith = makeError => {
    const client = new StudioManagerClient();
    client.axiosClient.defaults.adapter = config => Promise.reject(makeError(config));
    return client;
  };
  const logged = () => util.inspect(console.error.mock.calls, { depth: 10 });

  it("logs the path, the status and the webapp's answer, never the API key", async () => {
    const client = failingWith(
      config =>
        new axios.AxiosError(
          'Request failed with status code 500',
          'ERR_BAD_RESPONSE',
          config,
          {},
          {
            status: 500,
            data: { success: false },
            headers: {},
            config,
          }
        )
    );

    await expect(client.addStudioBrand({ name: 'Acme' })).resolves.toEqual({ success: false });
    expect(logged()).toContain('POST /brand | status: 500');
    expect(logged()).toContain('success: false');
    expect(logged()).not.toContain(API_KEY);
  });

  it("logs the error's message when the webapp doesn't answer, never the API key", async () => {
    const client = failingWith(
      config => new axios.AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED', config, {})
    );

    await expect(client.lookupUser('jo@example.com')).resolves.toBeNull();
    expect(logged()).toContain('POST /user/lookup | timeout of 5000ms exceeded');
    expect(logged()).not.toContain(API_KEY);
  });
});
