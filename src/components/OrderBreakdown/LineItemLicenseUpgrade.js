import React from 'react';
import { FormattedMessage } from 'react-intl';
import { LINE_ITEM_LICENSE_UPGRADE } from '../../util/types';
import { formatMoney } from '../../util/currency';

import css from './OrderBreakdown.module.css';

const LineItemLicenseUpgrade = props => {
  const { lineItems, intl } = props;

  const licenseUpgradeLineItem = lineItems.find(
    item => item.code === LINE_ITEM_LICENSE_UPGRADE && !item.reversal
  );

  return licenseUpgradeLineItem ? (
    <div className={css.lineItem}>
      <span className={css.itemLabel}>
        <FormattedMessage id="OrderBreakdown.licenseUpgrade" />
      </span>
      <span className={css.itemValue}>{formatMoney(intl, licenseUpgradeLineItem.lineTotal)}</span>
    </div>
  ) : null;
};

export default LineItemLicenseUpgrade;
