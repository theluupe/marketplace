/**
 * Leaves the app for another address (Auth0's login or logout, for instance), in one place so tests can replace
 * it: jsdom doesn't let a test replace or spy on `window.location`.
 */
export const leaveFor = url => window.location.assign(url);
