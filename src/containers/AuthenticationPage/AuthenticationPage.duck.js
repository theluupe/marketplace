import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { fetchInvitationBrand as fetchInvitationBrandApi } from '../../util/api';
import { fetchPageAssets } from '../../ducks/hostedAssets.duck';

export const TOS_ASSET_NAME = 'terms-of-service';
export const PRIVACY_POLICY_ASSET_NAME = 'privacy-policy';

// ================ Async thunks ================ //

// An invitation link's brand, for its page (spec/v0/login-and-registration.md §4.5.2): its name, or
// `notFound` for a brand the webapp doesn't know. Any other failure leaves both empty, and the page
// shows its generic invitation: a failure never reads as an invalid link.
export const fetchInvitationBrand = createAsyncThunk(
  'app/AuthenticationPage/fetchInvitationBrand',
  (brandStudioId, { rejectWithValue }) =>
    fetchInvitationBrandApi(brandStudioId).catch(e =>
      rejectWithValue({ notFound: e?.response?.status === 404 })
    )
);

// ================ Slice ================ //

const authenticationPageSlice = createSlice({
  name: 'AuthenticationPage',
  initialState: {
    invitationBrand: {
      brandStudioId: null,
      inProgress: false,
      companyName: null,
      notFound: false,
    },
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchInvitationBrand.pending, (state, action) => {
        state.invitationBrand = {
          brandStudioId: action.meta.arg,
          inProgress: true,
          companyName: null,
          notFound: false,
        };
      })
      .addCase(fetchInvitationBrand.fulfilled, (state, action) => {
        state.invitationBrand.inProgress = false;
        state.invitationBrand.companyName = action.payload?.companyName || null;
      })
      .addCase(fetchInvitationBrand.rejected, (state, action) => {
        state.invitationBrand.inProgress = false;
        state.invitationBrand.notFound = !!action.payload?.notFound;
      });
  },
});

export default authenticationPageSlice.reducer;

// ================ Load data ================ //

export const loadData = (params, search) => dispatch => {
  const pageAsset = {
    termsOfService: `content/pages/${TOS_ASSET_NAME}.json`,
    privacyPolicy: `content/pages/${PRIVACY_POLICY_ASSET_NAME}.json`,
  };
  // The invitation's brand is asked for in the browser only: the server's render can't call this
  // app's own API (`util/api.js` uses `window`), and the page renders it after mounting anyway.
  const { brandStudioId } = params || {};
  const brandMaybe =
    brandStudioId && typeof window !== 'undefined'
      ? [dispatch(fetchInvitationBrand(brandStudioId))]
      : [];
  return Promise.all([dispatch(fetchPageAssets(pageAsset, true)), ...brandMaybe]);
};
