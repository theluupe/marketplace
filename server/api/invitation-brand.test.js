jest.mock('../log.js', () => ({ error: jest.fn() }));
jest.mock('../api-util/studioHelper', () => ({ StudioManagerClient: jest.fn() }));

const log = require('../log.js');
const { StudioManagerClient } = require('../api-util/studioHelper');
const invitationBrand = require('./invitation-brand');

// spec/v0/login-and-registration.md §4.5.2
describe('invitation-brand', () => {
  let getBrand;
  let res;

  beforeEach(() => {
    getBrand = jest.fn();
    StudioManagerClient.mockImplementation(() => ({ getBrand }));
    res = {};
    ['status', 'json', 'end'].forEach(method => {
      res[method] = jest.fn(() => res);
    });
  });

  const ask = () => invitationBrand({ params: { brandStudioId: 'brand-1' } }, res);

  it("answers the brand's name, and nothing else", async () => {
    getBrand.mockResolvedValue({ id: 'brand-1', companyName: 'Acme', adminId: 'x' });

    await ask();

    expect(getBrand).toHaveBeenCalledWith('brand-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ companyName: 'Acme' });
  });

  it("answers 404 for a brand the webapp doesn't know", async () => {
    getBrand.mockResolvedValue(null);

    await ask();

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('answers 502, never 404, when the webapp fails', async () => {
    const error = new Error('webapp down');
    getBrand.mockRejectedValue(error);

    await ask();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(log.error).toHaveBeenCalledWith(error, 'invitation-brand-failed');
  });
});
