import Cookies from 'js-cookie';

import { isEmpty } from '../../util/common';
import { pickUserFieldsData, addScopePrefix, isStudioBrand } from '../../util/userHelpers';

/**
 * Filters out configured user-field entries, returning only the remaining key/value pairs.
 *
 * The signup and IdP confirm flows destructure a set of known identity fields from the form submit
 * values and handles the remaining fields as `protectedData`.
 * This helper picks those key/value pairs that are not configured as user fields.
 *
 * @param {Object} values - submit values from the form
 * @param {Array<{ scope: string, key: string }>} userFieldConfigs - Configured user field definitions.
 * @returns {Object} Remaining key/value pairs (non-user-field entries).
 */
export const getNonUserFieldParams = (values, userFieldConfigs) => {
  const userFieldKeys = userFieldConfigs.map(({ scope, key }) => addScopePrefix(scope, key));

  return Object.entries(values).reduce((picked, [key, value]) => {
    const isUserFieldKey = userFieldKeys.includes(key);

    return isUserFieldKey
      ? picked
      : {
          ...picked,
          [key]: value,
        };
  }, {});
};

/**
 * Builds extended data (public/private/protected) for the created currentUser entity.
 *
 * Returns an empty object when no extended data is provided.
 *
 * @param {Object} submitValues - Unhandled form submit values
 * @param {string} userType - The user type
 * @param {Array} userFields - User field configurations
 * @returns {{ publicData: Object, privateData: Object, protectedData: Object } | {}}
 */
export const getExtendedDataMaybe = (submitValues, userType, userFields) => {
  return !isEmpty(submitValues)
    ? {
        publicData: {
          userType,
          ...pickUserFieldsData(submitValues, 'public', userType, userFields),
        },
        privateData: {
          ...pickUserFieldsData(submitValues, 'private', userType, userFields),
        },
        protectedData: {
          ...pickUserFieldsData(submitValues, 'protected', userType, userFields),
          // If the form has any additional values, pass them forward as user's protected data
          ...getNonUserFieldParams(submitValues, userFields),
        },
      }
    : {};
};

/**
 * TheLuupe override of upstream's `getHandleSubmitConfirm`.
 *
 * Differences from upstream:
 *   - Reads `brandStudioId` from `authInfo` (set by Auth0 when a user follows a
 *     brand-studio invite link).
 *   - Pulls `location` and `newsletterOptIn` out of the submit values (TheLuupe's
 *     ConfirmSignupForm has these fields; upstream's doesn't).
 *   - Always sends trimmed `firstName` / `lastName` to the Marketplace API
 *     (upstream only sends them when changed).
 *   - When `userType === 'studio-brand' && brandStudioId`, marks the privateData
 *     with `withHiddenPrivateData = true` so the Sharetribe Integration API
 *     hides the brand-studio relationship from public exposure.
 *   - Threads `brandStudioId`, `location`, `newsletterOptIn` into privateData.
 *
 * Upstream's `getHandleSubmitSignup` (email + password signup) is intentionally
 * NOT preserved — TheLuupe is SSO-only and never dispatches `submitSignup`
 * (see `spec/upstream-merge-v10.14-to-v11.0.2.md` §1.1 #3).
 *
 * @param {Object} params
 * @param {Object} params.authInfo - The persisted st-authinfo cookie (idpToken, email, idpId, brandStudioId, ...)
 * @param {Function} params.submitSingupWithIdp - The signupWithIdp thunk dispatcher
 * @param {Array} params.userFields - Hosted user-field config
 * @returns {(values: Object) => void}
 */
export const getHandleSubmitConfirm = ({ authInfo, submitSingupWithIdp, userFields }) => values => {
  const { idpToken, email, idpId, brandStudioId } = authInfo;

  const {
    userType,
    email: newEmail,
    firstName: newFirstName,
    lastName: newLastName,
    displayName,
    location: newLocation,
    newsletterOptIn,
    ...rest
  } = values;

  const displayNameMaybe = displayName ? { displayName: displayName.trim() } : {};

  // Always send trimmed first/last name. Upstream conditionalises on change,
  // but TheLuupe sends them so trailing whitespace from the IdP is normalised.
  const authParams = {
    ...(newEmail !== email && { email: newEmail }),
    firstName: newFirstName.trim(),
    lastName: newLastName.trim(),
  };

  const location = newLocation && {
    address: newLocation?.selectedPlace?.address,
    geolocation: {
      lat: newLocation?.selectedPlace?.origin?.lat,
      lng: newLocation?.selectedPlace?.origin?.lng,
    },
    building: '',
  };

  // For brand-studio invitees, the privateData must be present even when no
  // user-field values are submitted, so the brandStudioId can be persisted.
  const withHiddenPrivateData = isStudioBrand(userType) && !!brandStudioId;

  const extendedDataMaybe =
    !isEmpty(rest) || withHiddenPrivateData || newsletterOptIn
      ? {
          publicData: {
            userType,
            ...pickUserFieldsData(rest, 'public', userType, userFields),
          },
          privateData: {
            ...pickUserFieldsData(rest, 'private', userType, userFields),
            ...(!!brandStudioId && { brandStudioId }),
            ...(!!location && { location }),
            ...(!!newsletterOptIn && { newsletterOptIn }),
          },
          protectedData: {
            ...pickUserFieldsData(rest, 'protected', userType, userFields),
            // If the confirm form has any additional values, pass them forward as user's protected data
            ...getNonUserFieldParams(rest, userFields),
          },
        }
      : {};

  submitSingupWithIdp({
    idpToken,
    idpId,
    ...authParams,
    ...displayNameMaybe,
    ...extendedDataMaybe,
  });
};

/**
 * Reads authentication info persisted in `st-authinfo` cookie.
 *
 * @returns {Object | null}
 */
export const getAuthInfoFromCookies = () => {
  return Cookies.get('st-authinfo')
    ? JSON.parse(Cookies.get('st-authinfo').replace('j:', ''))
    : null;
};

/**
 * Reads authentication error persisted in `st-autherror` cookie.
 *
 * @returns {Object | null}
 */
export const getAuthErrorFromCookies = () => {
  return Cookies.get('st-autherror')
    ? JSON.parse(Cookies.get('st-autherror').replace('j:', ''))
    : null;
};
