import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import { parse } from '../../util/urlHelpers';
import { leaveFor } from '../../util/browserNavigation';
import {
  accountLinkingSession,
  accountLinkingContinue,
  accountLinkingCancel,
} from '../../util/api';

// The account-linking page (spec/v0/account-linking.md §5): the Auth0 Action sends a login whose email already has
// an account here, with a token (§4.4) or an error (§4.7). The token is all the page has: it never has a
// Marketplace login.

// What the page shows (§5.2). The errors are the ones the Action and the server send.
export const VIEW_LOADING = 'loading';
export const VIEW_OFFER = 'offer';
export const VIEW_WRONG_ACCOUNT = 'wrong-account';
export const VIEW_CANCELLED = 'cancelled';
export const VIEW_EXPIRED = 'expired';
export const VIEW_BLOCKED = 'blocked';
export const VIEW_UNAVAILABLE = 'unavailable';
const ERROR_VIEWS = [VIEW_WRONG_ACCOUNT, VIEW_EXPIRED, VIEW_BLOCKED, VIEW_UNAVAILABLE];

// Cancel ends in Auth0's logout, which comes back to `?state=cancelled` without the token: the cancelled message's
// method names are kept in this tab until then.
export const CANCELLED_METHODS_KEY = 'accountLinking.cancelledMethods';
const storeCancelledMethods = kinds => {
  try {
    window.sessionStorage.setItem(CANCELLED_METHODS_KEY, JSON.stringify(kinds));
  } catch (e) {
    // Storage off: the message names "your other login method" instead
  }
};
const readCancelledMethods = () => {
  try {
    const kinds = JSON.parse(window.sessionStorage.getItem(CANCELLED_METHODS_KEY));
    return Array.isArray(kinds) ? kinds : [];
  } catch (e) {
    return [];
  }
};

// The server answers 401 for a token that's no longer valid, and 409 when what was pending changed since the token
// was made (linked in another tab, cancelled twice): both are "Please log in again" (§5.4).
const isExpiredAnswer = e => [401, 409].includes(e?.response?.status);

// ================ Async thunks ================ //

export const loadSession = createAsyncThunk(
  'app/AccountLinkingPage/loadSession',
  ({ token, error }, { rejectWithValue }) =>
    accountLinkingSession({ token, error }).catch(() => rejectWithValue(null))
);

// Continue and Cancel leave the page: the browser goes to the address the server answers.
export const continueLogin = createAsyncThunk(
  'app/AccountLinkingPage/continueLogin',
  (connection, { getState, rejectWithValue }) => {
    const { token } = getState().AccountLinkingPage;
    return accountLinkingContinue({ token, connection })
      .then(({ url }) => leaveFor(url))
      .catch(e => rejectWithValue({ expired: isExpiredAnswer(e) }));
  }
);

export const cancelLinking = createAsyncThunk(
  'app/AccountLinkingPage/cancelLinking',
  (_, { getState, rejectWithValue }) => {
    const { token, methods } = getState().AccountLinkingPage;
    return accountLinkingCancel({ token })
      .then(({ logoutUrl }) => {
        storeCancelledMethods(methods.map(method => method.kind));
        leaveFor(logoutUrl);
      })
      .catch(e => rejectWithValue({ expired: isExpiredAnswer(e) }));
  }
);

// ================ Slice ================ //

const initialState = {
  view: VIEW_LOADING,
  token: null,
  email: null,
  app: null,
  newMethod: null,
  // The original's methods: [{ connection, kind }], `kind` being password, google or other
  methods: [],
  // The method names for the cancelled message
  cancelledMethods: [],
  // The connection whose button was clicked, or 'cancel', until the browser leaves the page
  inProgress: null,
  actionFailed: false,
};

const actionRejected = (state, action) => {
  state.inProgress = null;
  if (action.payload?.expired) {
    state.view = VIEW_EXPIRED;
  } else {
    state.actionFailed = true;
  }
};

const accountLinkingPageSlice = createSlice({
  name: 'AccountLinkingPage',
  initialState,
  reducers: {
    showCancelled: (state, action) => {
      state.view = VIEW_CANCELLED;
      state.cancelledMethods = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadSession.pending, (state, action) => {
        Object.assign(state, initialState, { token: action.meta.arg.token || null });
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        const { error, email, app, newMethod, methods } = action.payload || {};
        state.view = ERROR_VIEWS.includes(error) ? error : email ? VIEW_OFFER : VIEW_EXPIRED;
        Object.assign(state, { email, app, newMethod, methods: methods || [] });
      })
      // The server failed (a 500 is its own setup, already logged there): logging in doesn't work right now
      .addCase(loadSession.rejected, state => {
        state.view = VIEW_UNAVAILABLE;
      })
      .addCase(continueLogin.pending, (state, action) => {
        state.inProgress = action.meta.arg;
        state.actionFailed = false;
      })
      .addCase(continueLogin.rejected, actionRejected)
      .addCase(cancelLinking.pending, state => {
        state.inProgress = 'cancel';
        state.actionFailed = false;
      })
      .addCase(cancelLinking.rejected, actionRejected);
  },
});

export const { showCancelled } = accountLinkingPageSlice.actions;
export default accountLinkingPageSlice.reducer;

// ================ Load data ================ //

// In the browser only: the server's render can't call this app's own API (`util/api.js` uses `window`), so it
// renders the loading state. The token is taken out of the address bar once read (§5.1), with the browser's own
// history: through the router, the address change would run this again, without the token.
export const loadData = (params, search) => dispatch => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  const { token, error, state } = parse(search);
  if (state === 'cancelled') {
    dispatch(showCancelled(readCancelledMethods()));
    return Promise.resolve();
  }
  if (token) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }
  return dispatch(loadSession({ token, error }));
};
