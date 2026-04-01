import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as log from '../util/log';
import { storableError } from '../util/errors';
import { apiBaseUrl, createUserWithIdp } from '../util/api';
import { fetchCurrentUser } from './user.duck';

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
 * Server handles Sharetribe revoke + OIDC + Auth0 (GET /api/auth/auth0/logout).
 * After location.replace we return a promise that never settles so logoutThunk.fulfilled does
 * not run before the document unloads. That mirrors legacy Luupe (only LOGOUT_REQUEST before
 * redirect). If we fulfilled immediately, root state / isAuthenticated flipped, protected
 * routes rendered NamedRedirect, and client routing cancelled full-page logout.
 */
const logoutThunk = createAsyncThunk(
  'auth/logout',
  (_, { rejectWithValue }) => {
    if (typeof window === 'undefined') {
      return Promise.resolve(true);
    }
    try {
      window.location.replace(`${apiBaseUrl()}/api/auth/auth0/logout`);
      return new Promise(() => {});
    } catch (e) {
      return rejectWithValue(storableError(e));
    }
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
