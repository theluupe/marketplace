import React from 'react';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import classNames from 'classnames';
import { ACCOUNT_SETTINGS_PAGES } from '../../routing/routeConfiguration';
import { LinkTabNavHorizontal } from '../../components';

import css from './UserNav.module.css';

/**
 * A component that renders a navigation bar for a user-specific pages.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} props.currentPage - The current page (e.g. 'ManageListingsPage')
 * @returns {JSX.Element} User navigation component
 */
const UserNav = props => {
  const { className, rootClassName, currentPage } = props;
  const classes = classNames(rootClassName || css.root, className);
  const intl = useIntl();

  const tabs = [
    {
      text: <FormattedMessage id="UserNav.favoriteListings" />,
      selected: currentPage === 'FavoriteListingsPage',
      linkProps: {
        name: 'FavoriteListingsPage',
      },
    },
    {
      text: <FormattedMessage id="UserNav.referralProgram" />,
      selected: currentPage === 'ReferralProgramPage',
      linkProps: {
        name: 'ReferralProgramPage',
      },
    },
    {
      text: <FormattedMessage id="UserNav.profileSettings" />,
      selected: currentPage === 'ProfileSettingsPage' || currentPage === 'CreativeDetailsPage',
      disabled: false,
      linkProps: {
        name: 'ProfileSettingsPage',
      },
    },
    {
      text: <FormattedMessage id="UserNav.accountSettings" />,
      selected: ACCOUNT_SETTINGS_PAGES.includes(currentPage),
      disabled: false,
      linkProps: {
        name: 'ContactDetailsPage',
      },
    },
  ];

  return (
    <LinkTabNavHorizontal
      className={classes}
      tabRootClassName={css.tab}
      tabs={tabs}
      skin="dark"
      ariaLabel={intl.formatMessage({ id: 'UserNav.screenreader.userNav' })}
    />
  );
};

export default UserNav;
