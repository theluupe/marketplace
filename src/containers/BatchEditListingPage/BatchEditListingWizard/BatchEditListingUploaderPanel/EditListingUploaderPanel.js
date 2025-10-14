import React from 'react';
import { Dashboard } from '@uppy/react';
import { Skeleton, Space, Button as AntdButton } from 'antd';
import { useSelector } from 'react-redux';

import { FormattedMessage } from '../../../../util/reactIntl';
import { MAX_NUMBER_OF_FILES } from '../../../../util/uppy';
import { Button, H3, IconSpinner } from '../../../../components';
import { getAllThumbnailsReady } from '../../BatchEditListingPage.duck';
import { BULK_UPLOAD_TEMPLATE_LINK } from '../../constants';

import css from './EditListingUploaderPanel.module.css';

const EditListingUploaderPanel = props => {
  const { onSubmit, submitReady, uppy } = props;
  const hasFiles = uppy ? uppy.getFiles().length > 0 : uppy;
  const allThumbnailsReady = useSelector(getAllThumbnailsReady);
  const isProcessingThumbnails = hasFiles && !allThumbnailsReady;

  const bulkUploadTemplateLink = (
    <AntdButton
      type="link"
      target="_blank"
      href={BULK_UPLOAD_TEMPLATE_LINK}
      className={css.bulkUploadTemplateLink}
    >
      bulk upload template
    </AntdButton>
  );

  return (
    <div className={css.root}>
      <H3 as="h1" className={css.heading}>
        <FormattedMessage id="BatchEditListingUploaderPanel.title" />
        <p>
          <FormattedMessage
            id="BatchEditListingUploaderPanel.subtitle"
            values={{
              maxNumberOfFiles: MAX_NUMBER_OF_FILES,
              bulkUploadTemplate: bulkUploadTemplateLink,
            }}
          />
        </p>
      </H3>
      {uppy ? (
        <>
          <Dashboard uppy={uppy} hideUploadButton={true} waitForThumbnailsBeforeUpload={true} />
          <Button
            className={css.submitButton}
            type="button"
            ready={submitReady}
            onClick={onSubmit}
            disabled={!hasFiles || isProcessingThumbnails}
          >
            {isProcessingThumbnails ? (
              <>
                <IconSpinner className={css.buttonSpinner} />
                <FormattedMessage id="BatchEditListingWizard.new.processingThumbnails"></FormattedMessage>
              </>
            ) : (
              <FormattedMessage id="BatchEditListingWizard.new.saveUpload"></FormattedMessage>
            )}
          </Button>
        </>
      ) : (
        <Space direction="vertical" size="large">
          <Skeleton.Node active style={{ width: 750, height: 550 }} />
          <Skeleton.Button active style={{ width: 220, height: 60 }} />
        </Space>
      )}
    </div>
  );
};

export default EditListingUploaderPanel;
