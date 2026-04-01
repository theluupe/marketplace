import React from 'react';
import { connect } from 'react-redux';

import { IconSpinner, NamedRedirect } from '../../components';
import { useConfiguration } from '../../context/configurationContext';
import { getDefaultInboxTab } from '../../util/userHelpers';

/**
 * /inbox → /inbox/sales or /inbox/orders. Route loadData runs loadInboxBaseData first so the user
 * slice has currentUser and currentUserHasListings before we read them (see fetchCurrentUser timing).
 */
const InboxDefaultRedirect = props => {
  const config = useConfiguration();
  const { currentUser, currentUserHasListings, inboxBaseDataStatus } = props;
  const baseDataReady = inboxBaseDataStatus === 'succeeded' || inboxBaseDataStatus === 'failed';

  if (!baseDataReady) {
    return <IconSpinner />;
  }

  const tab = getDefaultInboxTab(config, currentUser, currentUserHasListings);
  return <NamedRedirect name="InboxPage" params={{ tab }} />;
};

const mapStateToProps = state => ({
  currentUser: state.user.currentUser,
  currentUserHasListings: state.user.currentUserHasListings,
  inboxBaseDataStatus: state.InboxPage.inboxBaseDataStatus,
});

export default connect(mapStateToProps)(InboxDefaultRedirect);
