import React from 'react';
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { formatMoney } from '../../util/currency';
import { propTypes, LINE_ITEM_VOUCHER_DISCOUNT } from '../../util/types';

import css from './OrderBreakdown.module.css';

/**
 * A component that renders the voucher discount as a line item.
 *
 * @component
 * @param {Object} props
 * @param {Array<propTypes.lineItem>} props.lineItems - The line items to render
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const LineItemVoucherDiscount = props => {
  const { lineItems, intl } = props;

  const voucherDiscountLineItem = lineItems.find(
    item => item.code === LINE_ITEM_VOUCHER_DISCOUNT && !item.reversal
  );

  return voucherDiscountLineItem ? (
    <div className={css.lineItem}>
      <span className={css.itemLabel}>
        <FormattedMessage id="OrderBreakdown.voucherDiscount" />
      </span>
      <span className={css.itemValue}>{formatMoney(intl, voucherDiscountLineItem.lineTotal)}</span>
    </div>
  ) : null;
};

export default LineItemVoucherDiscount;
