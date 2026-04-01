import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { parse, getValidInboxSort } from '../../util/urlHelpers';
import { getSupportedProcessesInfo } from '../../transactions/transaction';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { fetchCurrentUser } from '../../ducks/user.duck';

const INBOX_PAGE_SIZE = 10;

// ================ Helper functions ================ //

const entityRefs = entities =>
  entities.map(entity => ({
    id: entity.id,
    type: entity.type,
  }));

// `/inbox`: finish fetchCurrentUser (and nested has-listings fetch) before redirect.
const loadInboxBaseDataThunk = createAsyncThunk(
  'InboxPage/loadInboxBaseData',
  async (_, { dispatch }) => {
    await dispatch(fetchCurrentUser());
  }
);

const loadDataPayloadCreator = ({ params, search }, { dispatch, rejectWithValue, extra: sdk }) => {
  const { tab } = params;

  const onlyFilterValues = {
    orders: 'order',
    sales: 'sale',
  };

  const onlyFilter = onlyFilterValues[tab];
  if (!onlyFilter) {
    return Promise.reject(new Error(`Invalid tab for InboxPage: ${tab}`));
  }

  const { page = 1, sort } = parse(search);
  const processNames = getSupportedProcessesInfo().map(p => p.name);

  const apiQueryParams = {
    only: onlyFilter,
    processNames,
    include: [
      'listing',
      'provider',
      'provider.profileImage',
      'customer',
      'customer.profileImage',
      'booking',
    ],
    'fields.transaction': [
      'processName',
      'lastTransition',
      'lastTransitionedAt',
      'transitions',
      'payinTotal',
      'payoutTotal',
      'lineItems',
    ],
    'fields.listing': ['title', 'availabilityPlan', 'publicData.listingType'],
    'fields.user': ['profile.displayName', 'profile.abbreviatedName', 'deleted', 'banned'],
    'fields.image': ['variants.square-small', 'variants.square-small2x'],
    page,
    perPage: INBOX_PAGE_SIZE,
    ...getValidInboxSort(sort),
  };

  return sdk.transactions
    .query(apiQueryParams)
    .then(response => {
      dispatch(addMarketplaceEntities(response));
      return response;
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const loadDataThunk = createAsyncThunk('InboxPage/loadData', loadDataPayloadCreator);

// ================ Slice ================ //

const inboxPageSlice = createSlice({
  name: 'InboxPage',
  initialState: {
    fetchInProgress: false,
    fetchOrdersOrSalesError: null,
    pagination: null,
    transactionRefs: [],
    inboxBaseDataStatus: 'idle',
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(loadInboxBaseDataThunk.pending, state => {
        state.inboxBaseDataStatus = 'loading';
      })
      .addCase(loadInboxBaseDataThunk.fulfilled, state => {
        state.inboxBaseDataStatus = 'succeeded';
      })
      .addCase(loadInboxBaseDataThunk.rejected, state => {
        state.inboxBaseDataStatus = 'failed';
      })
      .addCase(loadDataThunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchOrdersOrSalesError = null;
      })
      .addCase(loadDataThunk.fulfilled, (state, action) => {
        const transactions = action.payload.data.data;
        state.fetchInProgress = false;
        state.transactionRefs = entityRefs(transactions);
        state.pagination = action.payload.data.meta;
      })
      .addCase(loadDataThunk.rejected, (state, action) => {
        console.error(action.payload || action.error); // eslint-disable-line
        state.fetchInProgress = false;
        state.fetchOrdersOrSalesError = action.payload;
      });
  },
});

export default inboxPageSlice.reducer;

// Backward compatible wrapper for the thunk
export const loadData = (params, search) => (dispatch, getState, sdk) => {
  return dispatch(loadDataThunk({ params, search }));
};

export const loadInboxBaseData = () => (dispatch, getState, sdk) => {
  return dispatch(loadInboxBaseDataThunk());
};
