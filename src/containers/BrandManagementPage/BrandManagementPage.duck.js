import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { fetchCurrentUser } from '../../ducks/user.duck';
import { storableError } from '../../util/errors';
import { types as sdkTypes } from '../../util/sdkLoader';

const { UUID } = sdkTypes;

const toUserUuid = rawId => {
  if (!rawId) {
    return null;
  }
  if (typeof rawId === 'string') {
    return new UUID(rawId);
  }
  if (typeof rawId === 'object' && rawId.uuid) {
    return new UUID(rawId.uuid);
  }
  return null;
};

const fullNameFromUserResource = u => {
  if (!u?.attributes) {
    return '';
  }
  const profile = u.attributes.profile || {};
  const displayName = profile.displayName;
  const firstName = profile.firstName;
  const lastName = profile.lastName;
  const fromNames = [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return displayName || fromNames || u.attributes.email || '';
};

export const fetchBrandUsersThunk = createAsyncThunk(
  'BrandManagementPage/fetchBrandUsers',
  async (_, { dispatch, getState, extra: sdk, rejectWithValue }) => {
    try {
      await dispatch(fetchCurrentUser());
    } catch (e) {
      return rejectWithValue(storableError(e));
    }

    const user = getState().user.currentUser;
    const metadata = user?.attributes?.profile?.metadata;
    if (!metadata?.isBrandAdmin) {
      return { entries: [] };
    }

    const rawIds = Array.isArray(metadata.brandUsers) ? metadata.brandUsers : [];
    const entries = await Promise.all(
      rawIds.map(async rawId => {
        const id = toUserUuid(rawId);
        if (!id) {
          return { id: String(rawId), fullName: String(rawId) };
        }
        try {
          const res = await sdk.users.show({
            id,
            expand: true,
          });
          const u = res?.data?.data;
          const fullName = fullNameFromUserResource(u) || id.uuid;
          return { id: id.uuid, fullName };
        } catch (e) {
          return { id: id.uuid, fullName: id.uuid, fetchFailed: true };
        }
      })
    );

    return { entries };
  }
);

const brandManagementSlice = createSlice({
  name: 'BrandManagementPage',
  initialState: {
    brandUserEntries: [],
    fetchError: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchBrandUsersThunk.pending, state => {
        state.fetchError = null;
      })
      .addCase(fetchBrandUsersThunk.fulfilled, (state, action) => {
        state.brandUserEntries = action.payload.entries;
      })
      .addCase(fetchBrandUsersThunk.rejected, (state, action) => {
        state.fetchError = action.payload;
      });
  },
});

export default brandManagementSlice.reducer;

export const loadData = () => dispatch => {
  return dispatch(fetchBrandUsersThunk());
};
