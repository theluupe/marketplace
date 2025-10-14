import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Flex, Typography } from 'antd';
import { useParams } from 'react-router-dom';

import { Button, H3 } from '../../../../components';
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import {
  getAiTermsRequired,
  getInvalidListings,
  getListingCreationInProgress,
  getListingFieldsOptions,
  getListings,
  getSaveListingData,
  getSelectedRowsKeys,
  requestSaveBatchListings,
  requestUpdateListing,
  SAVE_LISTINGS_ABORTED,
  SET_AI_TERMS_ACCEPTED,
  SET_SELECTED_ROWS,
} from '../../BatchEditListingPage.duck';
import useStickyHeader from '../useStickyHeader';
import { PAGE_MODE_NEW } from '../../constants';

import { ListingValidationModal, AiTermsModal, ListingBatchProgressModal } from '../Modals';
import { CustomEditableTable, getLicensingGuideLink } from './CustomEditableTable';

import css from './EditListingBatchProductDetails.module.css';

const { Paragraph } = Typography;

export const EditListingBatchProductDetails = props => {
  const { cssRoot = css.root, editMode = false } = props;
  const intl = useIntl();
  const dispatch = useDispatch();
  const listings = useSelector(getListings);
  const licensingGuideLink = getLicensingGuideLink();
  const listingFieldsOptions = useSelector(getListingFieldsOptions);
  const listingsCreationInProgress = useSelector(getListingCreationInProgress);
  const selectedRowKeys = useSelector(getSelectedRowsKeys);
  const invalidListings = useSelector(getInvalidListings);
  const aiTermsRequired = useSelector(getAiTermsRequired);
  const { failedListings, successfulListings, selectedRowsKeys } = useSelector(getSaveListingData);

  const [termsAcceptedCheckbox, setTermsAcceptedCheckbox] = useState(false); // Use state to track checkbox value
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showAiTermsModal, setShowAiTermsModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const { mode } = useParams();

  const onTermsCheckboxChange = e => {
    setTermsAcceptedCheckbox(e.target.checked);
  };

  const onSelectChange = newSelectedRowKeys => {
    dispatch({ type: SET_SELECTED_ROWS, payload: newSelectedRowKeys });
  };

  const onSubmit = () => {
    dispatch(requestSaveBatchListings(mode));
  };

  const handleUpdateListing = updatedData => {
    dispatch(requestUpdateListing(updatedData));
  };

  const handleCancelValidationModal = () => {
    setShowValidationModal(false);
    dispatch({ type: SAVE_LISTINGS_ABORTED });
  };

  const handleCancelAiTermsModal = () => {
    setShowAiTermsModal(false);
    dispatch({ type: SAVE_LISTINGS_ABORTED });
  };

  const handleOkAiTermsModal = () => {
    if (termsAcceptedCheckbox) {
      dispatch({ type: SET_AI_TERMS_ACCEPTED });
      dispatch({ type: SAVE_LISTINGS_ABORTED });
      onSubmit();
    } else {
      dispatch({ type: SAVE_LISTINGS_ABORTED });
    }

    setShowAiTermsModal(false);
  };

  useEffect(() => {
    if (invalidListings.length > 0) {
      setShowValidationModal(listingsCreationInProgress);
      return;
    }

    if (aiTermsRequired && listings.some(listing => listing.isAi)) {
      setShowAiTermsModal(listingsCreationInProgress);
      return;
    }

    if (mode === PAGE_MODE_NEW) {
      setShowProgressModal(listingsCreationInProgress);
    }
  }, [
    invalidListings,
    aiTermsRequired,
    listingsCreationInProgress,
    failedListings,
    successfulListings,
    selectedRowsKeys,
  ]);

  useStickyHeader(css);

  const buttonTitleId = editMode
    ? 'BatchEditListingProductDetails.progressModal.submitButtonTextEditMode'
    : 'BatchEditListingProductDetails.progressModal.submitButtonText';

  const subtitleId = editMode
    ? 'BatchEditListingProductDetails.subtitleEditMode'
    : 'BatchEditListingProductDetails.subtitle';

  const ListingValidationModalHeaderText = intl.formatMessage({
    id: 'BatchEditListingProductDetails.validationModal.header',
  });
  const ListingValidationModalContentText = intl.formatMessage({
    id: 'BatchEditListingProductDetails.validationModal.content',
  });

  return (
    <div className={cssRoot}>
      <Flex className={css.stickyHeader}>
        <Flex vertical className={css.heading}>
          <H3 as="h1">
            <FormattedMessage id="BatchEditListingProductDetails.title" />
          </H3>
          <Flex className={css.subTitle} vertical>
            <Paragraph>
              <FormattedMessage id={subtitleId} values={{ learnMore: licensingGuideLink }} />
            </Paragraph>
            <Paragraph>
              <FormattedMessage id="BatchEditListingProductDetails.warningRefresh" />
            </Paragraph>
          </Flex>
        </Flex>

        <Flex className={css.buttonWrapper}>
          <Button
            className={css.submitButton}
            type="button"
            onClick={onSubmit}
            disabled={selectedRowKeys.length === 0 || listingsCreationInProgress}
          >
            <FormattedMessage id={buttonTitleId}></FormattedMessage>
          </Button>
        </Flex>
      </Flex>

      <div>
        <CustomEditableTable
          onSave={handleUpdateListing}
          listingFieldsOptions={listingFieldsOptions}
          onSelectChange={onSelectChange}
          selectedRowKeys={selectedRowKeys}
          listings={listings}
          editMode={editMode}
        ></CustomEditableTable>
      </div>

      <ListingValidationModal
        invalidListings={invalidListings}
        titleText={ListingValidationModalHeaderText}
        contentText={ListingValidationModalContentText}
        open={showValidationModal}
        onOk={handleCancelValidationModal}
        onCancel={handleCancelValidationModal}
      />

      <AiTermsModal
        onTermsCheckboxChange={onTermsCheckboxChange}
        open={showAiTermsModal}
        onOk={handleOkAiTermsModal}
        onCancel={handleCancelAiTermsModal}
        disabled={!termsAcceptedCheckbox}
      />

      <ListingBatchProgressModal
        percent={(successfulListings.length / selectedRowsKeys.length) * 100}
        open={showProgressModal}
      >
        {failedListings?.length > 0 && <Paragraph>{failedListings.length} files failed</Paragraph>}
      </ListingBatchProgressModal>
    </div>
  );
};
