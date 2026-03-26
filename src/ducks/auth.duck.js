import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as log from '../util/log';
import { storableError } from '../util/errors';
import { fetchCurrentUser } from './user.duck';
import { createUserWithIdp } from '../util/api';

const authenticated = authInfo => authInfo?.isAnonymous === false;
const loggedInAs = authInfo => authInfo?.isLoggedInAs === true;

// ================ Initial State ================ //

const initialState = {
  isAuthenticated: false,

  // is marketplace operator logged in as a marketplace user
  isLoggedInAs: false,

  // scopes associated with current token
  authScopes: [],

  // auth info
  authInfoLoaded: false,

  // logout
  logoutError: null,
  logoutInProgress: false,

  // confirm (create user with idp)
  confirmError: null,
  confirmInProgress: false,
};

// ================ Async Thunks ================ //

const authInfoThunk = createAsyncThunk('auth/authInfo', (_, thunkAPI) => {
  const { extra: sdk } = thunkAPI;
  return sdk.authInfo().catch(e => {
    log.error(e, 'auth-info-failed');
    return null;
  });
});

/**
 * Luupe: after SDK logout, redirect to Auth0 logout so the IdP session ends.
 * We do not dispatch clearCurrentUser here — doing so before the Auth0 redirect
 * can send users to the app login screen and skip Auth0 logout (see legacy
 * comment on this flow).
 */
const logoutThunk = createAsyncThunk(
  'auth/logout',
  (_, thunkAPI) => {
    const { rejectWithValue, extra: sdk } = thunkAPI;

    return sdk
      .logout()
      .then(() => {
        if (typeof window !== 'undefined') {
          const AUTH0_DOMAIN = process.env.REACT_APP_AUTH0_DOMAIN;
          const AUTH0_CLIENT_ID = process.env.REACT_APP_AUTH0_MARKETPLACE_CLIENT_ID;
          const returnTo = encodeURIComponent(process.env.REACT_APP_MARKETPLACE_ROOT_URL || '');
          window.location.href = `https://${AUTH0_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${returnTo}`;
        }
        return true;
      })
      .catch(e => rejectWithValue(storableError(e)));
  },
  {
    condition: (_, { getState }) => {
      if (getState().auth.logoutInProgress) {
        return false;
      }
    },
  }
);

const signupWithIdpThunk = createAsyncThunk(
  'auth/signupWithIdp',
  (params, thunkAPI) => {
    const { rejectWithValue, dispatch } = thunkAPI;
    return createUserWithIdp(params)
      .then(() => dispatch(fetchCurrentUser({ afterLogin: true })))
      .then(() => params)
      .catch(e => {
        log.error(e, 'create-user-with-idp-failed', { params });
        return rejectWithValue(storableError(e));
      });
  },
  {
    condition: (_, { getState }) => {
      if (getState().auth.confirmInProgress) {
        return false;
      }
    },
  }
);

// ================ Slice ================ //

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder.addCase(authInfoThunk.fulfilled, (state, action) => {
      const payload = action.payload;
      state.authInfoLoaded = true;
      state.isAuthenticated = authenticated(payload);
      state.isLoggedInAs = loggedInAs(payload);
      state.authScopes = payload?.scopes || [];
    });

    builder
      .addCase(logoutThunk.pending, state => {
        state.logoutInProgress = true;
        state.logoutError = null;
      })
      .addCase(logoutThunk.fulfilled, state => {
        state.logoutInProgress = false;
        state.isAuthenticated = false;
        state.isLoggedInAs = false;
        state.authScopes = [];
      })
      .addCase(logoutThunk.rejected, (state, action) => {
        state.logoutInProgress = false;
        state.logoutError = action.payload;
      });

    builder
      .addCase(signupWithIdpThunk.pending, state => {
        state.confirmInProgress = true;
        state.confirmError = null;
      })
      .addCase(signupWithIdpThunk.fulfilled, state => {
        state.confirmInProgress = false;
        state.isAuthenticated = true;
      })
      .addCase(signupWithIdpThunk.rejected, (state, action) => {
        state.confirmInProgress = false;
        state.confirmError = action.payload;
      });
  },
});

export { logoutThunk };
export default authSlice.reducer;

// ================ Selectors ================ //

export const authenticationInProgress = state => {
  const { logoutInProgress, confirmInProgress } = state.auth;
  return logoutInProgress || confirmInProgress;
};

// ================ Thunk Wrappers ================ //
// These maintain the same API as the original thunks

export const logout = () => (dispatch, getState, sdk) => {
  return dispatch(logoutThunk()).unwrap();
};

export const signupWithIdp = params => (dispatch, getState, sdk) => {
  return dispatch(signupWithIdpThunk(params)).unwrap();
};

export const authInfo = () => (dispatch, getState, sdk) => {
  return dispatch(authInfoThunk()).unwrap();
};
