import React from 'react';

import { createResourceLocatorString } from '../../../util/routes';
import { WIZARD_TABS } from '../constants';

import EditListingUploaderPanel from './BatchEditListingUploaderPanel/EditListingUploaderPanel';
import EditListingBatchTagging from './BatchEditListingTaggingPanel/EditListingBatchTagging';
import { EditListingBatchProductDetails } from './BatchEditListingProductDetails/EditListingBatchProductDetails';

const { UPLOAD, TAGGING, PRODUCT_DETAILS } = WIZARD_TABS;

const BatchEditListingWizardTab = props => {
  const { tab, params, history, routeConfiguration, uppy } = props;

  const onCompleteUploadTab = () => {
    const nextTab = { ...params, tab: TAGGING };
    const to = createResourceLocatorString('BatchEditListingPage', routeConfiguration, nextTab, {});
    history.push(to);
  };

  const onCompleteTaggingTab = () => {
    const nextTab = { ...params, tab: PRODUCT_DETAILS };
    const to = createResourceLocatorString('BatchEditListingPage', routeConfiguration, nextTab, {});
    history.push(to);
  };

  switch (tab) {
    case UPLOAD: {
      return <EditListingUploaderPanel onSubmit={onCompleteUploadTab} uppy={uppy} />;
    }
    case TAGGING: {
      return <EditListingBatchTagging onSubmit={onCompleteTaggingTab} />;
    }
    case PRODUCT_DETAILS: {
      return <EditListingBatchProductDetails />;
    }
    default:
      return null;
  }
};

export default BatchEditListingWizardTab;
