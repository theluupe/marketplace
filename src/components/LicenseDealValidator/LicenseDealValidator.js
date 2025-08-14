import React, { useState, useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams, useLocation } from 'react-router-dom';
import { Alert } from 'antd';
import { NamedLink } from '../../components';
import { validateLicenseDeal } from '../../util/api';
import { parse } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';
import { types as sdkTypes } from '../../util/sdkLoader';

import css from './LicenseDealValidator.module.css';

const { Money } = sdkTypes;

const LicenseDealValidator = props => {
  const { listingId, currency } = props;
  const [licenseDeal, setLicenseDeal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState(null);
  const location = useLocation();
  const params = useParams();
  const intl = useIntl();

  const loadingLicenseDealMessage = intl.formatMessage({
    id: 'LicenseDealValidator.loading',
  });
  const errorTitleMessage = intl.formatMessage({
    id: 'LicenseDealValidator.error.title',
  });
  const licenseDealTitleMessage = intl.formatMessage({
    id: 'LicenseDealValidator.licenseDeal.title',
  });

  useEffect(() => {
    const queryParams = parse(location.search);
    const licenseDealId = queryParams.licenseDeal;
    handleValidateLicenseDeal(licenseDealId, listingId);
  }, [location.search, listingId]);

  const handleValidateLicenseDeal = async (licenseDealId, listingId) => {
    setLoading(true);
    setErrorType(null);
    try {
      const withLincenseDeal = licenseDealId && listingId;
      if (!withLincenseDeal) {
        setLicenseDeal(null);
        return;
      }
      const data = await validateLicenseDeal({
        licenseDealId,
        listingId,
      });
      const withValidLicenseDeal = data.success && data.license;
      if (withValidLicenseDeal) {
        setLicenseDeal(data.license);
      } else {
        setErrorType('default');
      }
    } catch (e) {
      const errorType = e.error || 'default';
      setErrorType(errorType);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={css.container}>
        <Alert message={loadingLicenseDealMessage} type="info" showIcon />
      </div>
    );
  }

  if (errorType) {
    const buyWithDefaultLicenseLink = (
      <NamedLink name="CheckoutPage" params={params}>
        <FormattedMessage id="LicenseDealValidator.buyWithDefaultLicense" />
      </NamedLink>
    );
    return (
      <div className={css.container}>
        <Alert
          message={errorTitleMessage}
          description={
            <div>
              <p>
                <FormattedMessage id={`LicenseDealValidator.error.${errorType}`} />
              </p>
              <p className={css.contactMessage}>
                <FormattedMessage
                  id="LicenseDealValidator.contactMessage"
                  values={{ link: buyWithDefaultLicenseLink }}
                />
              </p>
            </div>
          }
          type="error"
          showIcon
        />
      </div>
    );
  }

  return licenseDeal ? (
    <div className={css.container}>
      <Alert
        message={licenseDealTitleMessage}
        description={
          <div>
            <div>
              <strong>
                <FormattedMessage id="LicenseDealValidator.licenseDeal.terms" />
              </strong>
              <p>{licenseDeal.customTerms}</p>
            </div>
            <div className={css.licensePrice}>
              <strong>
                <FormattedMessage id="LicenseDealValidator.licenseDeal.price" />
              </strong>
              <span className={css.price}>
                {licenseDeal.customPrice && currency
                  ? formatMoney(intl, new Money(licenseDeal.customPrice, currency))
                  : `$${(licenseDeal.customPrice / 100).toFixed(2)}`}
              </span>
            </div>
            <div className={css.expiryInfo}>
              <small>
                <FormattedMessage
                  id="LicenseDealValidator.licenseDeal.expiresAt"
                  values={{ expiresAt: new Date(licenseDeal.expiresAt).toLocaleDateString() }}
                />
              </small>
            </div>
          </div>
        }
        type="info"
        showIcon
      />
    </div>
  ) : null;
};

export default LicenseDealValidator;
