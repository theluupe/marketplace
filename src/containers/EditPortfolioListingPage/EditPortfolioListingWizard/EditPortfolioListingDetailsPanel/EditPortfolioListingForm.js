import { Form as FinalForm } from 'react-final-form';
import { compose } from 'redux';
import { injectIntl } from '../../../../util/reactIntl';
import { Button, FieldTextInput, Form } from '../../../../components';
import { composeValidators, maxLength, required } from '../../../../util/validators';
import React from 'react';
import css from './EditPortfolioListingForm.module.css';
import { useSelector } from 'react-redux';
import { message } from 'antd';

const TITLE_MAX_LENGTH = 60;

const EditPortfolioListingForm = props => {
  const { intl, onSubmit } = props;
  const saving = useSelector(state => state.EditPortfolioListingPage.saving);
  const portfolioListing = useSelector(state => state.EditPortfolioListingPage.portfolioListing);
  const isEditing = !!portfolioListing?.id;
  const initialTitle = portfolioListing?.attributes?.title || '';
  const [messageApi, contextHolder] = message.useMessage();

  const handleSubmit = async values => {
    try {
      const { title } = values;
      const shouldUpdate = title !== initialTitle;
      const listingDetails = { ...portfolioListing, title };
      onSubmit(listingDetails, isEditing, shouldUpdate);
    } catch (error) {
      messageApi.error('Error saving portfolio. Please try again.');
    }
  };

  const maxLength60Message = maxLength(
    'Max length for title is ' + TITLE_MAX_LENGTH,
    TITLE_MAX_LENGTH
  );

  return (
    <>
      {contextHolder}
      <FinalForm
        onSubmit={handleSubmit}
        initialValues={{ title: initialTitle }}
        render={formRenderProps => {
          const { formId, invalid, handleSubmit } = formRenderProps;
          const submitDisabled = invalid || saving;

          return (
            <Form className={css.root} onSubmit={handleSubmit}>
              <FieldTextInput
                id={`${formId}title`}
                name="title"
                className={css.title}
                type="text"
                label={intl.formatMessage({
                  id: 'EditPortfolioListingForm.title',
                  defaultMessage: 'Portfolio Title',
                })}
                placeholder={intl.formatMessage({
                  id: 'EditPortfolioListingForm.titlePlaceholder',
                  defaultMessage: 'Lifestyle Photography',
                })}
                maxLength={TITLE_MAX_LENGTH}
                validate={composeValidators(required('Title is required'), maxLength60Message)}
              />
              <Button
                className={css.submitButton}
                type="submit"
                inProgress={saving}
                disabled={submitDisabled}
              >
                Next
              </Button>
            </Form>
          );
        }}
      ></FinalForm>
    </>
  );
};

export default compose(injectIntl)(EditPortfolioListingForm);
