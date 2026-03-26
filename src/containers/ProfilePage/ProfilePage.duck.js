import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { fetchCurrentUser } from '../../ducks/user.duck';
import { types as sdkTypes, createImageVariantConfig } from '../../util/sdkLoader';
import { PROFILE_PAGE_PENDING_APPROVAL_VARIANT, parse } from '../../util/urlHelpers';
import { denormalisedResponseEntities } from '../../util/data';
import { storableError } from '../../util/errors';
import {
  hasPermissionToViewData,
  isUserAuthorized,
  isCreativeSellerApproved,
} from '../../util/userHelpers';
import { LISTING_GRID_DEFAULTS, LISTING_GRID_ROLE, LISTING_TAB_TYPES } from '../../util/types';
import { RESULT_PAGE_SIZE } from '../ManageListingsPage/ManageListingsPage.duck';

const { UUID } = sdkTypes;

const isCurrentUser = (userId, cu) => userId?.uuid === cu?.id?.uuid;

// ================ Async Thunks ================ //

//////////////////////
// Creative profile //
//////////////////////

const showCreativeProfilePayloadCreator = (
  { profileListingId, config },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  const params = {
    id: profileListingId,
    include: ['author'],
  };
  return sdk.listings
    .show(params)
    .then(data => {
      const listingFields = config?.listing?.listingFields;
      const sanitizeConfig = { listingFields };
      dispatch(addMarketplaceEntities(data, sanitizeConfig));
      return data;
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const showCreativeProfileThunk = createAsyncThunk(
  'ProfilePage/showCreativeProfile',
  showCreativeProfilePayloadCreator
);

///////////////
// Show User //
///////////////

const showUserPayloadCreator = ({ userId, config }, { dispatch, rejectWithValue, extra: sdk }) => {
  return sdk.users
    .show({
      id: userId,
      include: ['profileImage'],
      'fields.image': ['variants.square-small', 'variants.square-small2x'],
    })
    .then(response => {
      const userProfile = response?.data?.data?.attributes?.profile || {};
      const { metadata } = userProfile;
      const profileListingId = metadata?.profileListingId;
      const withCreativeProfile = isCreativeSellerApproved(userProfile);
      if (withCreativeProfile && profileListingId) {
        dispatch(showCreativeProfileThunk({ profileListingId, config }));
      }
      const userFields = config?.user?.userFields;
      const sanitizeConfig = { userFields };
      dispatch(addMarketplaceEntities(response, sanitizeConfig));
      return response;
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const showUserThunk = createAsyncThunk('ProfilePage/showUser', showUserPayloadCreator);

// Backward compatible wrapper for the thunk
export const showUser = (userId, config) => dispatch => {
  return dispatch(showUserThunk({ userId, config }));
};

/////////////////////////
// Query User Listings //
/////////////////////////

const queryUserListingsShouldRun = queryParams => {
  const listingType = queryParams.pub_listingType;
  const validListingType = !!listingType && listingType !== LISTING_TAB_TYPES.REVIEWS;
  const validCategoryType = !!queryParams.pub_categoryLevel1;
  return validListingType || validCategoryType;
};

const queryUserListingsPayloadCreator = (
  { userId, queryParams, config, ownProfileOnly = false },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  if (!queryUserListingsShouldRun(queryParams)) {
    return Promise.resolve({ listingRefs: [], meta: null, response: null });
  }

  const { perPage, pub_listingId, ...rest } = queryParams;
  const listingType = queryParams.pub_listingType;
  const withImageLimit = listingType !== LISTING_TAB_TYPES.PORTFOLIO;
  const params = { ...rest, perPage, ...(withImageLimit ? { 'limit.images': 1 } : {}) };

  const listingsPromise = ownProfileOnly
    ? sdk.ownListings.query({
        states: ['published'],
        ...params,
      })
    : sdk.listings.query({
        author_id: userId,
        ...params,
      });

  return listingsPromise
    .then(response => {
      const meta = response.data.meta;
      const listings = response.data.data;
      const listingRefs = listings
        .filter(l => l && !l.attributes.deleted && l.attributes.state === 'published')
        .map(({ id, type }) => ({ id, type }));
      dispatch(addMarketplaceEntities(response));
      return { listingRefs, meta, response };
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const queryUserListingsThunk = createAsyncThunk(
  'ProfilePage/queryUserListings',
  queryUserListingsPayloadCreator
);

// Backward compatible wrapper
export const queryUserListings = (
  userId,
  initQueryParams,
  config,
  ownProfileOnly = false
) => dispatch => {
  return dispatch(
    queryUserListingsThunk({ userId, queryParams: initQueryParams, config, ownProfileOnly })
  ).then(action => {
    if (queryUserListingsThunk.fulfilled.match(action)) {
      return action.payload.response;
    }
    return Promise.reject(action.payload ?? action.error);
  });
};

//////////////////////////
// Query User's Reviews //
//////////////////////////

const queryUserReviewsPayloadCreator = ({ userId }, { rejectWithValue, extra: sdk }) => {
  return sdk.reviews
    .query({
      subject_id: userId,
      state: 'public',
      include: ['author', 'author.profileImage'],
      'fields.image': ['variants.square-small', 'variants.square-small2x'],
    })
    .then(response => {
      const reviews = denormalisedResponseEntities(response);
      return reviews;
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const queryUserReviewsThunk = createAsyncThunk(
  'ProfilePage/queryUserReviews',
  queryUserReviewsPayloadCreator
);

// Backward compatible wrapper for the thunk
export const queryUserReviews = userId => dispatch => {
  return dispatch(queryUserReviewsThunk({ userId }));
};

// ================ Slice ================ //

const initialState = {
  userId: null,
  userShowInProgress: false,
  userShowError: null,
  creativeProfileListingId: null,
  queryCreativeProfileInProgress: false,
  queryCreativeProfileError: null,
  pagination: null,
  queryParams: {},
  queryInProgress: false,
  queryListingsError: null,
  currentPageResultIds: [],
  queryReviewsInProgress: false,
  queryReviewsError: null,
  reviews: [],
};

const profilePageSlice = createSlice({
  name: 'ProfilePage',
  initialState,
  reducers: {
    setInitialState: () => initialState,
    setUserId: (state, action) => {
      state.userId = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(showCreativeProfileThunk.pending, state => {
        state.queryCreativeProfileInProgress = true;
        state.queryCreativeProfileError = null;
      })
      .addCase(showCreativeProfileThunk.fulfilled, (state, action) => {
        state.creativeProfileListingId = action.payload.data.data.id;
        state.queryCreativeProfileInProgress = false;
      })
      .addCase(showCreativeProfileThunk.rejected, (state, action) => {
        state.queryCreativeProfileInProgress = false;
        state.queryCreativeProfileError = action.payload;
      })
      .addCase(showUserThunk.pending, state => {
        state.userShowInProgress = true;
        state.userShowError = null;
      })
      .addCase(showUserThunk.fulfilled, (state, action) => {
        state.userId = action.meta.arg.userId;
        state.userShowInProgress = false;
      })
      .addCase(showUserThunk.rejected, (state, action) => {
        state.userShowInProgress = false;
        state.userShowError = action.payload;
      })
      .addCase(queryUserListingsThunk.pending, (state, action) => {
        state.currentPageResultIds = [];
        state.queryParams = action.meta.arg.queryParams;
        state.queryInProgress = true;
        state.queryListingsError = null;
      })
      .addCase(queryUserListingsThunk.fulfilled, (state, action) => {
        state.currentPageResultIds = action.payload.listingRefs;
        state.pagination = action.payload.meta;
        state.queryInProgress = false;
      })
      .addCase(queryUserListingsThunk.rejected, (state, action) => {
        state.currentPageResultIds = [];
        state.queryListingsError = action.payload;
        state.queryInProgress = false;
      })
      .addCase(queryUserReviewsThunk.pending, state => {
        state.queryReviewsInProgress = true;
        state.queryReviewsError = null;
        state.reviews = [];
      })
      .addCase(queryUserReviewsThunk.fulfilled, (state, action) => {
        state.reviews = action.payload;
        state.queryReviewsInProgress = false;
      })
      .addCase(queryUserReviewsThunk.rejected, (state, action) => {
        state.reviews = [];
        state.queryReviewsInProgress = false;
        state.queryReviewsError = action.payload;
      });
  },
});

export const { setInitialState, setUserId } = profilePageSlice.actions;
export default profilePageSlice.reducer;

// ================ Load data ================ //

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const userId = new UUID(params.id);
  const isPreviewForCurrentUser = params.variant === PROFILE_PAGE_PENDING_APPROVAL_VARIANT;
  const currentUser = getState()?.user?.currentUser;
  const fetchCurrentUserOptions = {
    updateHasListings: false,
    updateNotifications: false,
  };

  const originalQueryParams = parse(search);
  const page = originalQueryParams.page || 1;
  const defaultListingType = LISTING_GRID_DEFAULTS.TYPE(LISTING_GRID_ROLE.PROFILE);
  const queryParams = {
    ...originalQueryParams,
    page,
    perPage: RESULT_PAGE_SIZE,
    ...(originalQueryParams.pub_listingType == null &&
    originalQueryParams.pub_categoryLevel1 == null
      ? { pub_listingType: defaultListingType }
      : {}),
  };

  dispatch(setInitialState());

  if (isPreviewForCurrentUser) {
    return dispatch(fetchCurrentUser(fetchCurrentUserOptions)).then(() => {
      if (isCurrentUser(userId, currentUser) && isUserAuthorized(currentUser)) {
        return Promise.all([
          dispatch(showUser(userId, config)),
          dispatch(queryUserListings(userId, queryParams, config)),
          dispatch(queryUserReviews(userId)),
        ]);
      } else if (isCurrentUser(userId, currentUser)) {
        return dispatch(setUserId(userId));
      }
      return Promise.resolve({});
    });
  }

  const isAuthorized = currentUser && isUserAuthorized(currentUser);
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const hasNoViewingRights = currentUser && !hasPermissionToViewData(currentUser);
  const canFetchData = !isPrivateMarketplace || (isPrivateMarketplace && isAuthorized);
  const canFetchOwnProfileOnly =
    isPrivateMarketplace &&
    isAuthorized &&
    hasNoViewingRights &&
    isCurrentUser(userId, currentUser);

  if (!canFetchData) {
    return Promise.resolve();
  } else if (canFetchOwnProfileOnly) {
    return Promise.all([
      dispatch(fetchCurrentUser(fetchCurrentUserOptions)),
      dispatch(queryUserListings(userId, queryParams, config, canFetchOwnProfileOnly)),
      dispatch(setUserId(userId)),
    ]);
  }

  return Promise.all([
    dispatch(fetchCurrentUser(fetchCurrentUserOptions)),
    dispatch(showUser(userId, config)),
    dispatch(queryUserListings(userId, queryParams, config)),
    dispatch(queryUserReviews(userId)),
  ]);
};
