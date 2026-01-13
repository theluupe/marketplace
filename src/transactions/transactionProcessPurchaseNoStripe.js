/**
 * Transaction process graph for product orders without payment:
 *   - default-purchase-no-stripe
 */

/**
 * Transitions
 *
 * These strings must sync with values defined in Marketplace API,
 * since transaction objects given by API contain info about last transitions.
 * All the actions in API side happen in transitions,
 * so we need to understand what those strings mean.
 */
export const transitions = {
  // When a customer makes an order for a listing, a transaction is
  // created with the initial request-payment transition.
  // This transition directly accepts the stock reservation and moves to purchased state.
  // No payment is required.
  REQUEST_PAYMENT: 'transition/request-payment',

  // THIS IS ONLY HERE TO AVOID VALIDATION ERRORS... on this particular transaction process we won't be able to inquire
  INQUIRE: 'transition/inquire',
  REQUEST_PAYMENT_AFTER_INQUIRY: 'transition/request-payment-after-inquiry',

  // System moves transaction automatically from purchased state to complete state
  // This makes it possible to to add notifications to that single transition.
  AUTO_COMPLETE: 'transition/auto-complete',

  // Reviews are given through transaction transitions.
  REVIEW_BY_CUSTOMER: 'transition/review-by-customer',
  EXPIRE_REVIEW_PERIOD: 'transition/expire-review-period',
};

/**
 * States
 *
 * These constants are only for making it clear how transitions work together.
 * You should not use these constants outside of this file.
 *
 * Note: these states are not in sync with states used transaction process definitions
 *       in Marketplace API. Only last transitions are passed along transaction object.
 */
export const states = {
  INITIAL: 'initial',
  PURCHASED: 'purchased',
  COMPLETED: 'completed',
  REVIEWED: 'reviewed',
};

/**
 * Description of transaction process graph
 *
 * You should keep this in sync with transaction process defined in Marketplace API
 *
 * Note: we don't use yet any state machine library,
 *       but this description format is following Xstate (FSM library)
 *       https://xstate.js.org/docs/
 */
export const graph = {
  // id is defined only to support Xstate format.
  // However if you have multiple transaction processes defined,
  // it is best to keep them in sync with transaction process aliases.
  id: 'default-purchase-no-stripe/release-1',

  // This 'initial' state is a starting point for new transaction
  initial: states.INITIAL,

  // States
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.REQUEST_PAYMENT]: states.PURCHASED,
      },
    },

    [states.PURCHASED]: {
      on: {
        [transitions.AUTO_COMPLETE]: states.COMPLETED,
      },
    },

    [states.COMPLETED]: {
      on: {
        [transitions.EXPIRE_REVIEW_PERIOD]: states.REVIEWED,
        [transitions.REVIEW_BY_CUSTOMER]: states.REVIEWED,
      },
    },

    [states.REVIEWED]: { type: 'final' },
  },
};

// Check if a transition is the kind that should be rendered
// when showing transition history (e.g. ActivityFeed)
// The first transition and most of the expiration transitions made by system are not relevant
export const isRelevantPastTransition = transition => {
  return [
    transitions.REQUEST_PAYMENT,
    transitions.AUTO_COMPLETE,
    transitions.REVIEW_BY_CUSTOMER,
  ].includes(transition);
};
export const isCustomerReview = transition => {
  return [transitions.REVIEW_BY_CUSTOMER].includes(transition);
};

export const isProviderReview = transition => {
  return false;
};

// Check if the given transition is privileged.
//
// Privileged transitions need to be handled from a secure context,
// i.e. the backend. This helper is used to check if the transition
// should go through the local API endpoints, or if using JS SDK is
// enough.
export const isPrivileged = transition => {
  return [transitions.REQUEST_PAYMENT].includes(transition);
};

// Check when transaction is completed (item is received and review notifications sent)
export const isCompleted = transition => {
  const txCompletedTransitions = [
    transitions.AUTO_COMPLETE,
    transitions.REVIEW_BY_CUSTOMER,
    transitions.EXPIRE_REVIEW_PERIOD,
  ];
  return txCompletedTransitions.includes(transition);
};

// Check when transaction is refunded (order did not happen)
// In the no-stripe process, there are no refunds since there are no payments
export const isRefunded = transition => {
  return false;
};

export const statesNeedingProviderAttention = [states.PURCHASED];
