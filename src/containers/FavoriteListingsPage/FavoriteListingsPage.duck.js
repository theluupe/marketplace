import { createSlice } from '@reduxjs/toolkit';

import { storableError } from '../../util/errors';
import { createImageVariantConfig } from '../../util/sdkLoader';
import { LISTING_GRID_DEFAULTS, LISTING_GRID_ROLE } from '../../util/types';
import { parse } from '../../util/urlHelpers';

import { RESULT_PAGE_SIZE } from '../ManageListingsPage/ManageListingsPage.duck';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { fetchCurrentUser } from '../../ducks/user.duck';

const resultIds = data => data.data.map(l => l.id);

const initialState = {
  pagination: null,
  queryParams: {},
  queryInProgress: false,
  queryFavoritesError: null,
  currentPageResultIds: [],
};

const favoriteListingsPageSlice = createSlice({
  name: 'FavoriteListingsPage',
  initialState,
  reducers: {
    fetchListingsRequest: {
      prepare: queryParams => ({ payload: { queryParams } }),
      reducer: (state, action) => {
        state.queryParams = action.payload.queryParams;
        state.queryInProgress = true;
        state.queryFavoritesError = null;
        state.currentPageResultIds = [];
      },
    },
    fetchListingsSuccess: (state, action) => {
      state.currentPageResultIds = resultIds(action.payload.data);
      state.pagination = action.payload.data.meta;
      state.queryInProgress = false;
    },
    fetchListingsError: (state, action) => {
      // eslint-disable-next-line no-console
      console.error(action.payload);
      state.queryInProgress = false;
      state.queryFavoritesError = action.payload;
    },
  },
});

export const {
  fetchListingsRequest,
  fetchListingsSuccess,
  fetchListingsError,
} = favoriteListingsPageSlice.actions;

export default favoriteListingsPageSlice.reducer;

// ================ Thunks ================ //

const createFavoriteBatches = favorites => {
  const batches = [];
  for (let i = 0; i < favorites.length; i += RESULT_PAGE_SIZE) {
    batches.push(favorites.slice(i, i + RESULT_PAGE_SIZE));
  }
  return batches;
};

// Throwing error for new (loadData may need that info)
export const queryFavoriteListings = queryParams => (dispatch, getState, sdk) => {
  dispatch(fetchListingsRequest(queryParams));
  const { currentUser } = getState().user;
  const favorites = currentUser?.attributes.profile.privateData?.favorites || {};
  const listingType = queryParams.pub_listingType;
  const validRequestParams = !!listingType;
  const parsedFavorites = favorites[listingType] || [];
  const withFavorites = !!parsedFavorites.length;
  const shouldRequest = withFavorites && validRequestParams;

  if (!shouldRequest) {
    const emptyObject = {
      data: {
        data: [],
        meta: {
          totalItems: 0,
          totalPages: 1,
          page: 1,
          paginationLimit: 1,
          perPage: RESULT_PAGE_SIZE,
        },
      },
    };
    dispatch(fetchListingsSuccess(emptyObject));
    return emptyObject;
  }

  const favoriteBatches = createFavoriteBatches(parsedFavorites);
  const { perPage, page, ...rest } = queryParams;
  const idsBatch = { ids: favoriteBatches[page - 1] };
  const params = { ...idsBatch, ...rest, perPage, page: 1 };
  return sdk.listings
    .query(params)
    .then(response => {
      const meta = {
        totalItems: parsedFavorites.length,
        totalPages: favoriteBatches.length,
        page,
        paginationLimit: favoriteBatches.length,
        perPage: RESULT_PAGE_SIZE,
      };
      const result = {
        data: {
          data: response?.data?.data,
          included: response?.data?.included,
          meta,
        },
      };
      dispatch(addMarketplaceEntities(result));
      dispatch(fetchListingsSuccess(result));
      return result;
    })
    .catch(e => {
      dispatch(fetchListingsError(storableError(e)));
      throw e;
    });
};

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const queryParams = parse(search);
  const page = queryParams.page || 1;
  const defaultListingType = LISTING_GRID_DEFAULTS.TYPE(LISTING_GRID_ROLE.FAVORITE);
  const pub_listingType = queryParams.pub_listingType || defaultListingType;
  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const aspectRatio = aspectHeight / aspectWidth;

  return Promise.all([
    dispatch(fetchCurrentUser()),
    dispatch(
      queryFavoriteListings({
        ...queryParams,
        pub_listingType,
        page,
        perPage: RESULT_PAGE_SIZE,
        include: ['author', 'author.profileImage', 'images'],
        'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
        'fields.image': [
          'variants.scaled-medium',
          `variants.${variantPrefix}`,
          `variants.${variantPrefix}-2x`,
        ],
        ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
        ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
        'limit.images': 1,
      })
    ),
  ]);
};
