import { createSlice } from '@reduxjs/toolkit';

import { createImageVariantConfig } from '../../util/sdkLoader';
import { storableError } from '../../util/errors';
import * as log from '../../util/log';
import { isCreativeSellerApproved } from '../../util/userHelpers';

import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { fetchCurrentUser } from '../../ducks/user.duck';

const getImageVariantInfo = listingImageConfig => {
  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } = listingImageConfig;
  const aspectRatio = aspectHeight / aspectWidth;
  const fieldsImage = [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`];

  return {
    fieldsImage,
    imageVariants: {
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    },
  };
};

const initialState = {
  listingId: null,
  updateListingError: null,
  showListingsError: null,
  updateInProgress: false,
};

const creativeDetailsPageSlice = createSlice({
  name: 'CreativeDetailsPage',
  initialState,
  reducers: {
    clearUpdated: state => {
      state.updateListingError = null;
    },
    updateListingRequest: state => {
      state.updateInProgress = true;
      state.updateListingError = null;
    },
    updateListingSuccess: state => {
      state.updateInProgress = false;
    },
    updateListingError: (state, action) => {
      state.updateInProgress = false;
      state.updateListingError = action.payload;
    },
    showListingsRequest: state => {
      state.showListingsError = null;
    },
    showListingsSuccess: (state, action) => {
      const listingIdFromPayload = action.payload.data.id;
      state.listingId = listingIdFromPayload;
      state.updateListingError = null;
      state.showListingsError = null;
      state.updateInProgress = false;
    },
    showListingsError: (state, action) => {
      // eslint-disable-next-line no-console
      console.error(action.payload);
      state.showListingsError = action.payload;
    },
  },
});

export const {
  clearUpdated,
  updateListingRequest,
  updateListingSuccess,
  updateListingError,
  showListingsRequest,
  showListingsSuccess,
  showListingsError,
} = creativeDetailsPageSlice.actions;

export default creativeDetailsPageSlice.reducer;

// ================ Thunk ================ //

export function requestShowListing(actionPayload, config) {
  return (dispatch, getState, sdk) => {
    const imageVariantInfo = getImageVariantInfo(config.layout.listingImage);
    const queryParams = {
      include: ['author', 'images', 'currentStock'],
      'fields.image': imageVariantInfo.fieldsImage,
      ...imageVariantInfo.imageVariants,
    };

    dispatch(showListingsRequest());
    return sdk.ownListings
      .show({ ...actionPayload, ...queryParams })
      .then(response => {
        dispatch(addMarketplaceEntities(response));
        dispatch(showListingsSuccess(response.data));
        return response;
      })
      .catch(e => dispatch(showListingsError(storableError(e))));
  };
}

export function requestUpdateListing(data, config) {
  return (dispatch, getState, sdk) => {
    dispatch(updateListingRequest());
    const { id, ...rest } = data;
    const ownListingUpdateValues = { id, ...rest };
    const imageVariantInfo = getImageVariantInfo(config.layout.listingImage);
    const queryParams = {
      expand: true,
      include: ['author', 'images', 'currentStock'],
      'fields.image': imageVariantInfo.fieldsImage,
      ...imageVariantInfo.imageVariants,
    };
    return sdk.ownListings
      .update(ownListingUpdateValues, queryParams)
      .then(response => {
        dispatch(updateListingSuccess());
        dispatch(addMarketplaceEntities(response));
        return response;
      })
      .catch(e => {
        log.error(e, 'update-listing-failed', { listingData: data });
        return dispatch(updateListingError(storableError(e)));
      });
  };
}

export const loadData = (params, search, config) => async (dispatch, getState) => {
  dispatch(clearUpdated());
  const fetchCurrentUserOptions = {
    updateNotifications: false,
  };
  await dispatch(fetchCurrentUser(fetchCurrentUserOptions));
  const currentUser = getState().user.currentUser;
  const { metadata } = currentUser?.attributes.profile || {};
  const profileListingId = metadata?.profileListingId;
  const withCreativeProfile = isCreativeSellerApproved(currentUser?.attributes.profile);
  if (!withCreativeProfile) {
    return [];
  }
  const payload = { id: profileListingId };
  return Promise.all([dispatch(requestShowListing(payload, config))]).catch(e => {
    throw e;
  });
};
