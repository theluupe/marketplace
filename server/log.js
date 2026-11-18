/**
 * Error logging for the Sharetribe Web Template's server. Can be used to
 * strap on an external error logging service like Sentry
 * or just plain printing errors to the log.
 */

const Sentry = require('@sentry/node');

const ENV = process.env.REACT_APP_ENV;
const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;
const VERBOSE = process.env.VERBOSE === 'true';
const DEV = process.env.REACT_APP_ENV === 'development';

const ingoreErrorsMap = {
  ['AxiosError: Network Error']: true,
};

const pickSelectedErrors = (ignored, entry) => {
  const [key, value] = entry;
  return value === true ? [...ignored, key] : ignored;
};

// Initialize Sentry ~ the way their suggested approach using instrument.js would have done it.
if (SENTRY_DSN) {
  const ignoreErrors = Object.entries(ingoreErrorsMap).reduce(pickSelectedErrors, []);

  // Configure the Sentry client. As is, this catches unhandled
  // exceptions from starting the server etc. but does not catch the
  // ones thrown from Express.js middleware functions. For those
  // an error handler has to be added to the Express app.
  Sentry.init({ dsn: SENTRY_DSN, environment: ENV, ignoreErrors });
}

/**
 * Returns a Sentry error handler in case
 * Sentry client is set up.
 */
exports.setupExpressErrorHandler = app => {
  if (SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
};

const responseAPIErrors = error => {
  return error && error.data && error.data.errors ? error.data.errors : [];
};

const responseApiErrorInfo = err =>
  responseAPIErrors(err).map(e => ({
    status: e.status,
    code: e.code,
    meta: e.meta,
  }));

/**
 * Logs a error. If Sentry client is set up
 * passes the error to that. Otherwise prints
 * the error to `console.error`.
 *
 * @param {Error} e Error that occurred
 * @param {String} code Error code
 * @param {Object} data Additional data to be sent to Sentry
 */
exports.error = (e, code, data) => {
  if (SENTRY_DSN) {
    const extra = { ...data, apiErrorData: responseApiErrorInfo(e) };

    Sentry.withScope(scope => {
      scope.setTag('code', code);
      Object.keys(extra).forEach(key => {
        scope.setExtra(key, extra[key]);
      });
      Sentry.captureException(e);
    });
  }
  // Let's log always to stdout
  console.error(e);
  console.error(code);
  console.error(data);
};

/**
 * Logs one structured line, for something worth reading later that isn't an error (use `error` for those). Cloud Run
 * reads a JSON line on stdout as a log entry with that severity, searchable by its fields in Logs Explorer
 * (e.g. `jsonPayload.source="account-linking"`; spec/v0/account-linking.md §5.6).
 *
 * @param {String} message What happened
 * @param {Object} data Fields to search by. Never personal data or secrets: the lines are kept 30 days.
 */
exports.info = (message, data = {}) => {
  console.log(JSON.stringify({ severity: 'INFO', message, ...data })); // eslint-disable-line no-console
};

exports.devLogger = (...args) => {
  if (DEV && VERBOSE) {
    console.log(...args); // eslint-disable-line no-console
  }
};
