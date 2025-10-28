import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Flex, Typography } from 'antd';

import { Button, H3 } from '../../../../components';
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import {
  getListings,
  requestUpdateListing,
  requestSaveTags,
  getSelectedRowsKeys,
  getInvalidListings,
  getAllKeywordsReady,
  getKeywordsGenerationProgress,
  getListingFieldsOptions,
  SET_SELECTED_ROWS,
} from '../../BatchEditListingPage.duck';
import useStickyHeader from '../useStickyHeader';

import { ListingValidationModal, AiProgressModal } from '../Modals';
import { CustomEditableTable } from './CustomEditableTable';

import css from '../BatchEditListingProductDetails/EditListingBatchProductDetails.module.css';

const { Paragraph } = Typography;

export const EditListingBatchTagging = props => {
  const { onSubmit } = props;
  const intl = useIntl();
  const dispatch = useDispatch();
  const listings = useSelector(getListings);
  const listingFieldsOptions = useSelector(getListingFieldsOptions);
  const selectedRowKeys = useSelector(getSelectedRowsKeys);
  const invalidListings = useSelector(getInvalidListings);
  const allKeywordsReady = useSelector(getAllKeywordsReady);
  const keywordsProgress = useSelector(getKeywordsGenerationProgress);

  const [showValidationModal, setShowValidationModal] = useState(false);

  const onSelectChange = newSelectedRowKeys => {
    dispatch({ type: SET_SELECTED_ROWS, payload: newSelectedRowKeys });
  };

  const handleUpdateListing = updatedData => {
    dispatch(requestUpdateListing(updatedData));
  };

  const handleSubmit = () => {
    dispatch(requestSaveTags(onSubmit));
  };

  const handleCancelValidationModal = () => {
    setShowValidationModal(false);
  };

  useEffect(() => {
    if (invalidListings.length > 0) {
      setShowValidationModal(true);
    }
  }, [invalidListings]);

  useStickyHeader(css);

  const ListingValidationModalHeaderText = intl.formatMessage({
    id: 'BatchEditListingTaggingPanel.validationModal.header',
  });
  const ListingValidationModalContentText = intl.formatMessage({
    id: 'BatchEditListingTaggingPanel.validationModal.content',
  });

  return (
    <div className={css.root}>
      <Flex className={css.stickyHeader}>
        <Flex vertical className={css.heading}>
          <H3 as="h1">
            <FormattedMessage id="BatchEditListingTaggingPanel.title" />
          </H3>
          <Flex className={css.subTitle} vertical>
            <Paragraph>
              <FormattedMessage id="BatchEditListingTaggingPanel.subtitle" />
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
            onClick={handleSubmit}
            disabled={selectedRowKeys.length === 0}
          >
            <FormattedMessage id="BatchEditListingTaggingPanel.saveTags" />
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
        />
      </div>

      <ListingValidationModal
        invalidListings={invalidListings}
        titleText={ListingValidationModalHeaderText}
        contentText={ListingValidationModalContentText}
        open={showValidationModal}
        onOk={handleCancelValidationModal}
        onCancel={handleCancelValidationModal}
      />

      <AiProgressModal
        open={!allKeywordsReady}
        total={keywordsProgress.total}
        completed={keywordsProgress.completed}
        percent={keywordsProgress.percent}
      />
    </div>
  );
};

export default EditListingBatchTagging;
