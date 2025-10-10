import React from 'react';
import { Modal, Radio, Space, Typography } from 'antd';
import { FormattedMessage } from 'react-intl';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

import css from './Modals.module.css';

export const KEYWORDS_MERGE_OPTIONS = {
  REPLACE: 'replace',
  MERGE: 'merge',
};

export const DEFAULT_KEYWORDS_MERGE_OPTION = KEYWORDS_MERGE_OPTIONS.MERGE;

export const KeywordsMergeModal = ({ open, onOk, onCancel, selectedOption, onOptionChange }) => {
  return (
    <Modal
      title={
        <Space size="large">
          <Text type="info">
            <InfoCircleOutlined />
          </Text>
          <FormattedMessage id="CsvUpload.keywordsModal.title" />
        </Space>
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      closable={false}
      cancelButtonProps={{ hidden: true }}
      width={600}
    >
      <div className={css.modalContent}>
        <Paragraph>
          <FormattedMessage id="CsvUpload.keywordsModal.description" />
        </Paragraph>
        <Paragraph>
          <Radio.Group onChange={onOptionChange} value={selectedOption} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value={KEYWORDS_MERGE_OPTIONS.MERGE}>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    <FormattedMessage id="CsvUpload.keywordsModal.merge.title" />
                  </div>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    <FormattedMessage id="CsvUpload.keywordsModal.merge.description" />
                  </Text>
                </div>
              </Radio>
              <Radio value={KEYWORDS_MERGE_OPTIONS.REPLACE}>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    <FormattedMessage id="CsvUpload.keywordsModal.replace.title" />
                  </div>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    <FormattedMessage id="CsvUpload.keywordsModal.replace.description" />
                  </Text>
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        </Paragraph>
      </div>
    </Modal>
  );
};
