const { StudioManagerClient } = require('./studioHelper');

describe('StudioManagerClient.lookupUser', () => {
  const answeredWith = response => {
    const client = new StudioManagerClient();
    client.axiosClient.post = jest.fn().mockResolvedValue(response);
    return client;
  };

  it('posts the email with a short timeout and returns the webapp user', async () => {
    const user = { id: 'user-1', type: 'BRAND', brandId: 'brand-1' };
    const client = answeredWith({ data: { success: true, data: { user } } });

    await expect(client.lookupUser('jo@example.com')).resolves.toEqual(user);
    expect(client.axiosClient.post).toHaveBeenCalledWith(
      '/user/lookup',
      { email: 'jo@example.com' },
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

    expect(client.axiosClient.post).toHaveBeenCalledWith('/brand/brand-1/user', {
      email: 'jo@example.com',
    });
    expect(result).toEqual({
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
