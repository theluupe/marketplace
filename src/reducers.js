import { combineReducers } from '@reduxjs/toolkit';
import * as globalReducers from './ducks';
import * as pageReducers from './containers/reducers';

/**
 * Function _createReducer_ combines global reducers (reducers that are used in
 * multiple pages) and reducers that are handling actions happening inside one page container.
 * Since we combineReducers, pageReducers will get page specific key (e.g. SearchPage)
 * which is page specific.
 * Future: this structure could take in asyncReducers, which are changed when you navigate pages.
 */
const appReducer = combineReducers({
  ...globalReducers,
  ...pageReducers,
});

const createReducer = () => {
  return (state, action) => {
    // Do not reset the store when logoutThunk fulfills during client logout: the thunk keeps
    // the logout promise pending until the document unloads so isAuthenticated stays true and
    // protected routes do not render NamedRedirect (racing full-page /api/auth/auth0/logout). Matches
    // legacy Luupe: only LOGOUT_REQUEST before redirect, never USER_LOGOUT / store clear:
    // https://github.com/theluupe/marketplace/blob/dev/src/ducks/auth.duck.js
    return appReducer(state, action);
  };
};

export default createReducer;
