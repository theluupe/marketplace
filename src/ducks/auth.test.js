import { storableError } from '../util/errors';
import configureStore from '../store';
import reducer, { authenticationInProgress, logout } from './auth.duck';

const logger = actions => () => {
  return next => action => {
    actions.push(action);
    // Call the next dispatch method in the middleware chain.
    return next(action);
  };
};

describe('auth duck', () => {
  describe('reducer', () => {
    it('should be logged out with no errors by default', () => {
      const state = reducer(undefined, { type: '@@INIT' });
      expect(state.isAuthenticated).toEqual(false);
      expect(state.authInfoLoaded).toEqual(false);
      expect(state.logoutError).toBeNull();
      expect(state.confirmError).toBeNull();
      expect(state.logoutInProgress).toEqual(false);
      expect(state.confirmInProgress).toEqual(false);
      expect(authenticationInProgress({ auth: state })).toEqual(false);
    });

    it('should set initial state for unauthenticated users', () => {
      const authInfoLoggedOut = {};
      const initialState = reducer(undefined, { type: '@@INIT' });
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, {
        type: 'auth/authInfo/fulfilled',
        payload: authInfoLoggedOut,
      });
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(false);
    });

    it('should set initial state for anonymous users', () => {
      const authInfoAnonymous = { isAnonymous: true };
      const initialState = reducer(undefined, { type: '@@INIT' });
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, {
        type: 'auth/authInfo/fulfilled',
        payload: authInfoAnonymous,
      });
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(false);
    });

    it('should set initial state for authenticated users', () => {
      const authInfoLoggedIn = { isAnonymous: false };
      const initialState = reducer(undefined, { type: '@@INIT' });
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, {
        type: 'auth/authInfo/fulfilled',
        payload: authInfoLoggedIn,
      });
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(true);
    });
  });

  describe('logout thunk', () => {
    it('should dispatch success', () => {
      const initialState = reducer(undefined, { type: '@@INIT' });
      const sdk = { logout: jest.fn(() => Promise.resolve({})) };
      let actions = [];
      const store = configureStore({
        initialState: { auth: initialState },
        sdk,
        extraMiddlewares: [logger(actions)],
      });
      const dispatch = store.dispatch;
      const getState = store.getState;

      return logout()(dispatch, getState, sdk).then(() => {
        expect(sdk.logout.mock.calls.length).toEqual(1);

        expect(actions[0].type).toBe('auth/logout/pending');
        expect(actions[1].type).toBe('auth/logout/fulfilled');
      });
    });
    it('should dispatch error', () => {
      const initialState = reducer(undefined, { type: '@@INIT' });
      const error = new Error('could not logout');
      const sdk = { logout: jest.fn(() => Promise.reject(error)) };
      let actions = [];
      const store = configureStore({
        initialState: { auth: initialState },
        sdk,
        extraMiddlewares: [logger(actions)],
      });
      const dispatch = store.dispatch;
      const getState = store.getState;

      return logout()(dispatch, getState, sdk).catch(() => {
        expect(sdk.logout.mock.calls.length).toEqual(1);
        expect(actions[0].type).toBe('auth/logout/pending');
        expect(actions[1].type).toBe('auth/logout/rejected');
        expect(actions[1].payload).toEqual(storableError(error));
      });
    });
    it('should reject if another logout is in progress', () => {
      const initialState = reducer(undefined, { type: '@@INIT' });
      const logoutInProgressState = reducer(initialState, { type: 'auth/logout/pending' });
      const sdk = { logout: jest.fn(() => Promise.resolve({})) };
      let actions = [];
      const store = configureStore({
        initialState: { auth: logoutInProgressState },
        sdk,
        extraMiddlewares: [logger(actions)],
      });
      const dispatch = store.dispatch;
      const getState = store.getState;

      return logout()(dispatch, getState, sdk).then(
        () => {
          throw new Error('should not succeed');
        },
        e => {
          expect(e.message).toEqual('Aborted due to condition callback returning false.');
          expect(sdk.logout.mock.calls.length).toEqual(0);
          expect(actions.length).toEqual(0);
        }
      );
    });
  });
});
