import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { referralProgramOptIn } from '../../util/api';
import { storableError } from '../../util/errors';

import { fetchCurrentUser } from '../../ducks/user.duck';

// ================ Async thunks ================ //

export const queryReferralCodeThunk = createAsyncThunk(
  'app/ReferralProgramPage/queryReferralCode',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { currentUser } = getState().user;
      const referralCode = currentUser?.attributes?.profile?.privateData?.referralCode || null;
      if (referralCode) {
        return referralCode;
      }
      const { code } = await referralProgramOptIn({});
      return code;
    } catch (e) {
      return rejectWithValue(storableError(e));
    }
  }
);

export const queryReferralCode = () => dispatch => dispatch(queryReferralCodeThunk()).unwrap();

// ================ Slice ================ //

const referralProgramPageSlice = createSlice({
  name: 'ReferralProgramPage',
  initialState: {
    queryInProgress: false,
    queryReferralCodeError: null,
    referralCode: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(queryReferralCodeThunk.pending, state => {
        state.queryInProgress = true;
        state.queryReferralCodeError = null;
        state.referralCode = null;
      })
      .addCase(queryReferralCodeThunk.fulfilled, (state, action) => {
        state.queryInProgress = false;
        state.referralCode = action.payload;
      })
      .addCase(queryReferralCodeThunk.rejected, (state, action) => {
        if (action.meta.aborted) {
          return;
        }
        // eslint-disable-next-line no-console
        console.error(action.payload || action.error);
        state.queryInProgress = false;
        state.queryReferralCodeError = action.payload;
      });
  },
});

export default referralProgramPageSlice.reducer;

// ================ Load data ================ //

export const loadData = () => dispatch => {
  return Promise.all([dispatch(fetchCurrentUser()), dispatch(queryReferralCode())]);
};
