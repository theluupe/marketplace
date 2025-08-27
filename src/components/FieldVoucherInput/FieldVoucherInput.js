import React, { useState, useEffect } from 'react';
import { Alert, Button as AButton, Collapse } from 'antd';
import { SendOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons';

import { FieldTextInput } from '../../components';
import { validateVoucher } from '../../util/api';
import { FormattedMessage, useIntl } from '../../util/reactIntl';

import css from './FieldVoucherInput.module.css';

const FieldVoucherInput = ({ form, formId, listingId, isLoggedIn }) => {
  const intl = useIntl();
  const [voucherCode, setVoucherCode] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);
  const [isApplied, setIsApplied] = useState(false);

  useEffect(() => {
    const shouldClearError = !!error;
    if (shouldClearError) {
      setError(null);
    }
  }, [voucherCode]);

  const handleVoucherSubmit = async e => {
    e.preventDefault();
    setIsValidating(true);
    setError(null);
    setIsApplied(false);
    form.change('isVoucherApplied', false);
    try {
      const data = await validateVoucher({ voucherCode, listingId });
      const withValidLicenseDeal = data.isValid;
      if (!withValidLicenseDeal) {
        throw new Error('Invalid voucher code');
      }
      setIsApplied(true);
      form.change('isVoucherApplied', true);
    } catch {
      setError('Failed to validate voucher. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveVoucher = () => {
    setError(null);
    setIsApplied(false);
    form.change('isVoucherApplied', false);
  };

  const handleOnChange = event => {
    const value = event.target.value;
    const code = value.trim();
    setVoucherCode(code);
    form.change('voucherCode', code);
  };

  const itemContent = isApplied ? (
    <Alert
      message={
        <div className={css.voucherApplied}>
          <div className={css.voucherInfo}>
            <span className={css.voucherCode}>{voucherCode}</span>
            <span className={css.voucherStatus}>
              <FormattedMessage id="FieldVoucherInput.appliedVoucher" />
            </span>
          </div>
          <AButton
            type="text"
            icon={<DeleteOutlined style={{ fontSize: '20px' }} />}
            onClick={handleRemoveVoucher}
            className={css.removeButton}
          />
        </div>
      }
      type="success"
      showIcon
    />
  ) : (
    <div className={css.voucherInput}>
      <div className={css.inputGroup}>
        <FieldTextInput
          id={`${formId}.voucherCode`}
          name="voucherCode"
          type="text"
          placeholder={intl.formatMessage({ id: 'FieldVoucherInput.placeholder' })}
          value={voucherCode}
          disabled={isValidating}
          className={css.voucherField}
          onChange={handleOnChange}
        />
        <FieldTextInput id={`${formId}.isVoucherApplied`} name="isVoucherApplied" type="hidden" />
        <AButton
          icon={isValidating ? <LoadingOutlined /> : <SendOutlined />}
          disabled={isValidating || !voucherCode}
          className={css.applyButton}
          onClick={handleVoucherSubmit}
        />
      </div>

      {error && <Alert className={css.error} message={error} type="error" />}
    </div>
  );

  const items = [
    {
      key: '1',
      label: intl.formatMessage({ id: 'FieldVoucherInput.label' }),
      children: isLoggedIn ? (
        itemContent
      ) : (
        <span className={css.loginText}>
          <FormattedMessage id="FieldVoucherInput.loginText" />
        </span>
      ),
      style: {
        padding: 0,
      },
    },
  ];
  return <Collapse className={css.collapse} ghost items={items} />;
};

export default FieldVoucherInput;
