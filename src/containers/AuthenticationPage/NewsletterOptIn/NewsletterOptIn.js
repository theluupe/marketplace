import React from 'react';
import { FieldCheckbox } from '../../../components';
import { FormattedMessage } from '../../../util/reactIntl';
import css from './NewsletterOptIn.module.css';

const NewsletterOptIn = ({ formId }) => (
  <div className={css.root}>
    <FieldCheckbox
      name="newsletterOptIn"
      id={formId ? `${formId}.newsletter-opt-in` : 'newsletter-opt-in'}
      label={<FormattedMessage id="ConfirmSignupForm.newsletterOptInLabel" />}
      textClassName={css.finePrint}
    />
  </div>
);

export default NewsletterOptIn;
