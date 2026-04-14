import { createSlice } from '@reduxjs/toolkit';

import { createImageVariantConfig } from '../../util/sdkLoader';
import { PAGE_MODE_NEW } from '../BatchEditListingPage/constants';
import { LISTING_TYPES } from '../../util/types';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

// Return an array of image ids
const imageIds = images => {
  return images ? images.map(img => img.imageId || img.id) : null;
};

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

function getSdkRequestParams(config, ignoreImages = false) {
  const imageVariantInfo = getImageVariantInfo(config.layout.listingImage);
  const queryParams = {
    expand: true,
    ...(ignoreImages ? {} : { include: ['images'] }),
    'fields.image': imageVariantInfo.fieldsImage,
    ...imageVariantInfo.imageVariants,
  };
  return queryParams;
}

const initialState = {
  portfolioListing: null,
  images: [],
  videos: [],
  loading: false,
  error: null,
  saving: false,
  saveError: null,
  publishing: false,
  publishError: null,
  updating: false,
  updateError: null,
  uploading: false,
  uploadError: null,
};

const editPortfolioListingPageSlice = createSlice({
  name: 'EditPortfolioListingPage',
  initialState,
  reducers: {
    resetPortfolioState: () => initialState,

    fetchPortfolioRequest: state => {
      state.loading = true;
      state.error = null;
    },
    fetchPortfolioSuccess: (state, action) => {
      state.loading = false;
      state.portfolioListing = action.payload.portfolioListing;
      state.images = action.payload.images;
      state.videos = action.payload.videos;
    },
    fetchPortfolioError: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    draftPortfolioRequest: state => {
      state.saving = true;
      state.saveError = null;
    },
    draftPortfolioSuccess: (state, action) => {
      state.saving = false;
      state.portfolioListing = action.payload;
    },
    draftPortfolioError: (state, action) => {
      state.saving = false;
      state.saveError = action.payload;
    },

    publishListingRequest: state => {
      state.publishing = true;
      state.publishError = null;
    },
    publishListingSuccess: (state, action) => {
      state.publishing = false;
      state.portfolioListing = action.payload;
    },
    publishListingError: (state, action) => {
      state.publishing = false;
      state.publishError = action.payload;
    },

    updateListingMediaRequest: state => {
      state.updating = true;
      state.updateError = null;
    },
    updateListingMediaSuccess: (state, action) => {
      state.updating = false;
      state.portfolioListing = action.payload;
    },
    updateListingMediaError: (state, action) => {
      state.updating = false;
      state.updateError = action.payload;
    },

    uploadMediaRequest: state => {
      state.uploading = true;
      state.uploadError = null;
    },
    uploadMediaSuccess: (state, action) => {
      state.uploading = false;
      state.images.push(action.payload);
    },
    uploadMediaError: (state, action) => {
      state.uploading = false;
      state.uploadError = action.payload;
    },

    addVideoSuccess: (state, action) => {
      state.videos.push(action.payload);
    },

    removeImageSuccess: (state, action) => {
      state.images = state.images.filter(image => image.id !== action.payload);
    },
    removeVideoSuccess: (state, action) => {
      state.videos = state.videos.filter(video => video.id !== action.payload);
    },
  },
});

export const {
  resetPortfolioState,
  fetchPortfolioRequest,
  fetchPortfolioSuccess,
  fetchPortfolioError,
  draftPortfolioRequest,
  draftPortfolioSuccess,
  draftPortfolioError,
  publishListingRequest,
  publishListingSuccess,
  publishListingError,
  updateListingMediaRequest,
  updateListingMediaSuccess,
  updateListingMediaError,
  uploadMediaRequest,
  uploadMediaSuccess,
  uploadMediaError,
  addVideoSuccess,
  removeImageSuccess,
  removeVideoSuccess,
} = editPortfolioListingPageSlice.actions;

export default editPortfolioListingPageSlice.reducer;

// ================ Thunk ================ //

export function requestCreateListingDraft(title) {
  return (dispatch, getState, sdk) => {
    dispatch(draftPortfolioRequest());
    const listing = {
      title,
      publicData: {
        listingType: LISTING_TYPES.PORTFOLIO,
        transactionProcessAlias: 'default-inquiry/release-1',
        unitType: 'inquiry',
      },
    };
    return sdk.ownListings
      .createDraft(listing)
      .then(response => {
        const portfolioListing = response.data.data;
        dispatch(draftPortfolioSuccess(portfolioListing));
        return portfolioListing;
      })
      .catch(e => {
        dispatch(draftPortfolioError(e));
        throw e;
      });
  };
}

export const updatePortfolioListing = (data, config) => (dispatch, getState, sdk) => {
  dispatch(draftPortfolioRequest());
  const queryParams = getSdkRequestParams(config);
  return sdk.ownListings
    .update(data, queryParams)
    .then(response => {
      const portfolioListing = response.data.data;
      dispatch(draftPortfolioSuccess(portfolioListing));
      dispatch(addMarketplaceEntities(response));
      return portfolioListing;
    })
    .catch(e => {
      dispatch(draftPortfolioError(e));
      throw e;
    });
};

export const publishPortfolioListing = listingId => (dispatch, getState, sdk) => {
  dispatch(publishListingRequest());
  return sdk.ownListings
    .publishDraft({ id: listingId })
    .then(response => {
      const portfolioListing = response.data.data;
      dispatch(publishListingSuccess(portfolioListing));
      return portfolioListing;
    })
    .catch(e => {
      console.error(e, 'publish-listing-failed');
      dispatch(publishListingError(e));
    });
};

export function updateListingMedia(data, config) {
  return (dispatch, getState, sdk) => {
    dispatch(updateListingMediaRequest());
    const { id, images, videos } = data;
    const videoProperty = { publicData: { videos } };
    const imageProperty = { images: imageIds(images) };
    const ownListingUpdateValues = { id, ...imageProperty, ...videoProperty };
    const queryParams = getSdkRequestParams(config);
    return sdk.ownListings
      .update(ownListingUpdateValues, queryParams)
      .then(response => {
        const portfolioListing = response.data.data;
        dispatch(updateListingMediaSuccess(portfolioListing));
        dispatch(addMarketplaceEntities(response));
        return portfolioListing;
      })
      .catch(e => {
        dispatch(updateListingMediaError({ id, error: e }));
      });
  };
}

export function uploadMedia(actionPayload, config) {
  return (dispatch, getState, sdk) => {
    const id = actionPayload.id;
    const queryParams = getSdkRequestParams(config, true);
    dispatch(uploadMediaRequest());
    return sdk.images
      .upload({ image: actionPayload.file }, queryParams)
      .then(resp => {
        const img = resp.data.data;
        const uploadedImage = {
          ...img,
          id,
          imageId: img.id,
          file: actionPayload.file,
        };
        dispatch(uploadMediaSuccess(uploadedImage));
        return uploadedImage;
      })
      .catch(e => {
        dispatch(uploadMediaError({ id, error: e }));
      });
  };
}

export const saveVideoToListing = video => dispatch => {
  dispatch(addVideoSuccess(video));
};

export const removeImageFromListing = imageId => dispatch => {
  dispatch(removeImageSuccess(imageId));
};

export const removeVideoFromListing = videoId => dispatch => {
  dispatch(removeVideoSuccess(videoId));
};

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const { id, mode } = params;
  dispatch(resetPortfolioState());
  if (mode === PAGE_MODE_NEW) {
    return Promise.resolve();
  }
  dispatch(fetchPortfolioRequest());
  const queryParams = getSdkRequestParams(config);
  return sdk.ownListings
    .show({ id, ...queryParams })
    .then(response => {
      const portfolioListing = response.data.data;
      const included = response.data.included || [];
      const listingImages = portfolioListing?.relationships?.images?.data || [];
      const images = listingImages.map(image => {
        const asset = included.find(element => element.id.uuid === image.id.uuid);
        return {
          id: asset.id.uuid,
          attributes: asset.attributes || { variants: {} },
          type: 'imageAsset',
        };
      });
      const videos = portfolioListing?.attributes?.publicData?.videos || [];
      dispatch(fetchPortfolioSuccess({ portfolioListing, images, videos }));
      return { ...portfolioListing, images, videos };
    })
    .catch(error => {
      dispatch(fetchPortfolioError(error));
      throw error;
    });
};

export const savePortfolioListingsOrder = orderedIds => async (dispatch, getState, sdk) => {
  try {
    await Promise.all(
      orderedIds.map((id, index) => {
        return sdk.ownListings.update({
          id,
          publicData: {
            order: index + 1,
          },
          privateData: {
            order: null,
          },
        });
      })
    );
  } catch (e) {
    console.error('Failed to update listing order:', e);
  }
};
