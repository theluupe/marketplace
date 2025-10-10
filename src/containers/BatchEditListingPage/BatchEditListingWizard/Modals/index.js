import React from 'react';
import { Checkbox, List, Space, Typography, Modal, Progress, Spin } from 'antd';
import {
  FileExclamationOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import { FormattedMessage } from '../../../../util/reactIntl';
import { H3 } from '../../../../components';
import css from './Modals.module.css';

const { Text, Paragraph } = Typography;

export {
  KeywordsMergeModal,
  KEYWORDS_MERGE_OPTIONS,
  DEFAULT_KEYWORDS_MERGE_OPTION,
} from './KeywordsMergeModal';

export function ListingValidationModal({
  invalidListings,
  titleText,
  contentText,
  open,
  onOk,
  onCancel,
}) {
  return (
    <Modal
      title={
        <Space size="large">
          <Text type="danger">
            <ExclamationCircleOutlined />
          </Text>
          <FormattedMessage id="BatchEditListingProductDetails.validationModal.title"></FormattedMessage>
        </Space>
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      cancelButtonProps={{ hidden: true }}
      width={800}
    >
      <div className={css.modalContent}>
        <Paragraph>{titleText}</Paragraph>
        <Paragraph>
          <List
            dataSource={invalidListings}
            renderItem={item => (
              <List.Item>
                <Space size="middle">
                  <FileExclamationOutlined /> {item}
                </Space>
              </List.Item>
            )}
          />
        </Paragraph>
        <Paragraph className={css.modalBottom}>{contentText}</Paragraph>
      </div>
    </Modal>
  );
}

export function AiTermsModal({ onTermsCheckboxChange, open, onOk, onCancel, disabled }) {
  return (
    <Modal
      title={
        <Space size="large">
          <Text type="warning">
            <WarningOutlined />
          </Text>
          <FormattedMessage id="BatchEditListingProductDetails.aiContentModal.title"></FormattedMessage>
        </Space>
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okButtonProps={{ disabled }}
      width={800}
    >
      <div className={css.modalContent}>
        <Paragraph>
          <FormattedMessage id="BatchEditListingProductDetails.aiContentModal.content"></FormattedMessage>
        </Paragraph>
        <Paragraph className={css.modalBottom}>
          <Checkbox onChange={onTermsCheckboxChange}>
            <FormattedMessage id="BatchEditListingProductDetails.aiContentModal.optIn"></FormattedMessage>
          </Checkbox>
        </Paragraph>
      </div>
    </Modal>
  );
}

export function ListingBatchProgressModal({ percent, open, children }) {
  return (
    <Modal
      title={
        <FormattedMessage id="BatchEditListingProductDetails.progressModal.title"></FormattedMessage>
      }
      open={open}
      footer={null}
      keyboard={false}
      closable={false}
    >
      <H3>
        <FormattedMessage id="BatchEditListingProductDetails.progressModal.content.title"></FormattedMessage>
      </H3>
      <Paragraph>
        <FormattedMessage id="BatchEditListingProductDetails.progressModal.content.description"></FormattedMessage>
      </Paragraph>
      <Paragraph>
        <Progress percent={percent} type="line" showInfo={false} />
      </Paragraph>
      {children}
    </Modal>
  );
}

export function AiProgressModal({ open }) {
  return (
    <Modal
      title={
        <div style={{ textAlign: 'center' }}>
          <FormattedMessage id="BatchEditListingTaggingPanel.generatingModal.title"></FormattedMessage>
        </div>
      }
      open={open}
      footer={null}
      keyboard={false}
      closable={false}
    >
      <div style={{ textAlign: 'center' }}>
        <H3>
          <FormattedMessage id="BatchEditListingTaggingPanel.generatingModal.content.title"></FormattedMessage>
        </H3>
        <Paragraph>
          <FormattedMessage id="BatchEditListingTaggingPanel.generatingModal.content.description"></FormattedMessage>
        </Paragraph>
        <Paragraph>
          <Spin size="large" />
        </Paragraph>
      </div>
    </Modal>
  );
}
