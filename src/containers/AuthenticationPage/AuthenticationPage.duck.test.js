import { configureStore } from '@reduxjs/toolkit';

import { fetchInvitationBrand as fetchInvitationBrandApi } from '../../util/api';
import reducer, { fetchInvitationBrand } from './AuthenticationPage.duck';

jest.mock('../../util/api', () => ({ fetchInvitationBrand: jest.fn() }));

// spec/v0/login-and-registration.md §4.5.2
describe('AuthenticationPage.duck, the invitation brand', () => {
  const ask = async () => {
    const store = configureStore({ reducer: { AuthenticationPage: reducer } });
    await store.dispatch(fetchInvitationBrand('brand-1'));
    return store.getState().AuthenticationPage.invitationBrand;
  };
  const failure = status => Object.assign(new Error(), { response: { status } });

  it("keeps the brand's name", async () => {
    fetchInvitationBrandApi.mockResolvedValue({ companyName: 'Acme' });

    expect(await ask()).toEqual({
      brandStudioId: 'brand-1',
      inProgress: false,
      companyName: 'Acme',
      notFound: false,
    });
    expect(fetchInvitationBrandApi).toHaveBeenCalledWith('brand-1');
  });

  it("marks a brand the webapp doesn't know", async () => {
    fetchInvitationBrandApi.mockRejectedValue(failure(404));

    expect(await ask()).toMatchObject({ notFound: true, companyName: null });
  });

  it('never reads a failure as an invalid link', async () => {
    fetchInvitationBrandApi.mockRejectedValue(failure(502));

    expect(await ask()).toMatchObject({ notFound: false, companyName: null, inProgress: false });
  });
});
