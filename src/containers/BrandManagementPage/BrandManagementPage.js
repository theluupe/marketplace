import React, { useCallback } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { List, Typography, notification } from 'antd';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { pathByRouteName } from '../../util/routes';
import { showPaymentDetailsForUser, showBrandManagementTab } from '../../util/userHelpers';

import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  H3,
  NamedRedirect,
  Page,
  UserNav,
  LayoutSideNavigation,
  PrimaryButton,
} from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './BrandManagementPage.module.css';

export const BrandManagementPageComponent = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();

  const { currentUser, scrollingDisabled, brandUserEntries } = props;

  const metadata = currentUser?.attributes?.profile?.metadata;
  const privateData = currentUser?.attributes?.profile?.privateData;
  const isBrandAdmin = metadata?.isBrandAdmin === true;
  const brandStudioId = privateData?.brandStudioId;

  const { showPayoutDetails, showPaymentMethods } = showPaymentDetailsForUser(config, currentUser);
  const showBrandManagement = showBrandManagementTab(currentUser);
  const accountSettingsNavProps = {
    currentPage: 'BrandManagementPage',
    showPaymentMethods,
    showPayoutDetails,
    showBrandManagement,
  };

  const title = intl.formatMessage({ id: 'BrandManagementPage.title' });

  const handleInviteBrandUser = useCallback(() => {
    if (!brandStudioId) {
      notification.error({
        message: intl.formatMessage({ id: 'BrandManagementPage.missingStudioId' }),
      });
      return;
    }
    const pathname = pathByRouteName('SignupForBrandUserPage', routeConfiguration, {
      userType: 'studio-brand',
      brandStudioId,
    });
    const inviteUrl = `${window.location.origin}${pathname}`;
    const toastText = intl.formatMessage({ id: 'BrandManagementPage.inviteCopyToast' });
    const copy = () =>
      navigator.clipboard.writeText(inviteUrl).then(
        () => {
          notification.success({
            message: toastText,
            placement: 'topRight',
          });
        },
        () => {
          notification.error({
            message: intl.formatMessage({ id: 'BrandManagementPage.copyFailed' }),
          });
        }
      );
    void copy();
  }, [brandStudioId, intl, routeConfiguration]);

  if (!isBrandAdmin) {
    return <NamedRedirect name="ContactDetailsPage" />;
  }

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSideNavigation
        topbar={
          <>
            <TopbarContainer
              desktopClassName={css.desktopTopbar}
              mobileClassName={css.mobileTopbar}
            />
            <UserNav currentPage="BrandManagementPage" />
          </>
        }
        sideNav={null}
        useAccountSettingsNav
        accountSettingsNavProps={accountSettingsNavProps}
        footer={<FooterContainer />}
        intl={intl}
      >
        <div className={css.content}>
          <H3 as="h1">
            <FormattedMessage id="BrandManagementPage.heading" />
          </H3>
          <p className={css.description}>
            <FormattedMessage id="BrandManagementPage.description" />
          </p>
          <div className={css.actions}>
            <PrimaryButton type="button" onClick={handleInviteBrandUser}>
              <FormattedMessage id="BrandManagementPage.inviteButton" />
            </PrimaryButton>
          </div>
          <List
            className={css.userList}
            bordered
            dataSource={brandUserEntries}
            locale={{
              emptyText: intl.formatMessage({ id: 'BrandManagementPage.noBrandUsers' }),
            }}
            renderItem={item => (
              <List.Item>
                <Typography.Text>{item.fullName}</Typography.Text>
                {item.fetchFailed ? (
                  <Typography.Text type="secondary">
                    {' '}
                    (<FormattedMessage id="BrandManagementPage.nameUnavailable" />)
                  </Typography.Text>
                ) : null}
              </List.Item>
            )}
          />
        </div>
      </LayoutSideNavigation>
    </Page>
  );
};

const mapStateToProps = state => ({
  currentUser: state.user.currentUser,
  scrollingDisabled: isScrollingDisabled(state),
  brandUserEntries: state.BrandManagementPage?.brandUserEntries || [],
});

const BrandManagementPage = compose(connect(mapStateToProps))(BrandManagementPageComponent);

export default BrandManagementPage;
