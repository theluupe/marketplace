import React from 'react';
import { Button } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';

import { useConfiguration } from '../../../context/configurationContext.js';
import { Heading } from '../../../components';
import { FormattedMessage } from '../../../util/reactIntl';
import { generateDownloadUrls } from '../../../util/api';

import css from './TransactionPanel.module.css';

export default function DigitalProductDownload({
  currentUser,
  transactionId,
  transactionRole,
  processState,
  processStates,
  protectedData,
}) {
  const config = useConfiguration();
  const { marketplaceRootURL } = config;

  // Extract licenseDeal from protectedData
  const licenseDeal = protectedData?.licenseDeal;
  const customTerms = licenseDeal?.customTerms;

  async function downloadHanlder() {
    const { filename, url } = await generateDownloadUrls({
      transactionId,
      userId: currentUser.id.uuid,
    });
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    link.rel = 'noreferrer noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const isCustomer = transactionRole === 'customer';
  if (!isCustomer) {
    return null;
  }

  switch (processState) {
    case processStates.PURCHASED:
    case processStates.COMPLETED:
    case processStates.REVIEWED:
      return (
        <div>
          <div className={css.licenseContainer}>
            <Heading as="h3" rootClassName={css.sectionHeading}>
              <FormattedMessage id="TransactionPanel.downloadDigitalProduct.licenseTitle" />
            </Heading>
            <div className={css.feedContent}>
              {customTerms && (
                <div className={css.customTermsContainer}>
                  <p className={css.customTermsText}>{customTerms}</p>
                </div>
              )}
              <Button
                type="link"
                target="_blank"
                href={`${marketplaceRootURL}/p/standard-royalty-free-license`}
                className={css.licenseLink}
              >
                <FormattedMessage id="TransactionPanel.downloadDigitalProduct.licenseLink" />
              </Button>
            </div>
          </div>
          <div className={css.downloadButtonWrapper}>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              className={css.downloadButton}
              onClick={downloadHanlder}
            >
              <FormattedMessage id="TransactionPanel.downloadDigitalProduct.downloadButton" />
            </Button>
          </div>
        </div>
      );
    default:
      return null;
  }
}
