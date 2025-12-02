import React, { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button, message, Tooltip, Upload } from 'antd';
import Papa from 'papaparse';
import { DownloadOutlined, InfoCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';

import {
  CSV_UPLOAD_ERROR,
  CSV_UPLOAD_REQUEST,
  CSV_UPLOAD_SUCCESS,
  getListings,
} from '../../BatchEditListingPage.duck';
import { BULK_UPLOAD_TEMPLATE_LINK } from '../../constants';
import {
  KeywordsMergeModal,
  KEYWORDS_MERGE_OPTIONS,
  DEFAULT_KEYWORDS_MERGE_OPTION,
} from '../Modals';

import {
  getCsvFieldValue,
  normalizeBoolean,
  normalizeCategory,
  normalizeUsage,
} from './CsvParsingHelpers';
import { deduplicateKeywords } from '../../../../util/string';

import css from './CsvUpload.module.css';

export const CsvUpload = ({ categories, usageOptions, onSaveListing }) => {
  const listings = useSelector(getListings);
  const dispatch = useDispatch();
  const intl = useIntl();

  const [showModal, setShowModal] = useState(false);
  const [keywordsMergeOption, setKeywordsMergeOption] = useState(DEFAULT_KEYWORDS_MERGE_OPTION);
  const [pendingCsvData, setPendingCsvData] = useState(null);

  const csvUploadTooltip = intl.formatMessage({
    id: 'CsvUpload.tooltip',
  });
  const beforeUpload = file => {
    const isCsv = file.type === 'text/csv';
    if (!isCsv) {
      void message.error('You can only upload CSV files!');
    }
    return isCsv || Upload.LIST_IGNORE;
  };

  const handleCsvFile = request => {
    const { file } = request;
    dispatch({ type: CSV_UPLOAD_REQUEST });

    // noinspection JSUnresolvedReference
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => {
        setPendingCsvData({ data: result.data, headers: result.meta.fields });
        setShowModal(true);
        dispatch({ type: CSV_UPLOAD_SUCCESS });
      },
      error: error => {
        message.error(`Error parsing CSV: ${error.message}`);
        dispatch({ type: CSV_UPLOAD_ERROR, payload: error });
      },
    });
    return false;
  };

  const handleModalOk = () => {
    if (pendingCsvData) {
      const { data, headers } = pendingCsvData;
      processCsvData(data, headers, keywordsMergeOption);
      setShowModal(false);
      setPendingCsvData(null);
    }
  };

  const handleModalCancel = () => {
    setShowModal(false);
    setPendingCsvData(null);
    setKeywordsMergeOption(DEFAULT_KEYWORDS_MERGE_OPTION);
  };

  const handleOptionChange = e => {
    setKeywordsMergeOption(e.target.value);
  };

  const processCsvData = (data, headers, mergeOption = DEFAULT_KEYWORDS_MERGE_OPTION) => {
    if (!data.length) {
      message.warning('CSV file is empty or invalid.');
      return;
    }

    // Build a lookup map for quick matching
    const listingsMap = new Map(listings.map(listing => [listing.name, listing]));

    const updatedListings = [];

    data.forEach(row => {
      const fallbackRow = Object.values(row); // Convert row to an array for positional access
      const fileName = getCsvFieldValue(row, headers, 'fileName', fallbackRow);

      if (fileName) {
        const listing = listingsMap.get(fileName.trim());
        if (listing) {
          const csvKeywordsRaw = getCsvFieldValue(row, headers, 'keywords', fallbackRow);
          let keywords = deduplicateKeywords(listing.keywords || []);
          if (csvKeywordsRaw) {
            const csvKeywords = deduplicateKeywords(csvKeywordsRaw);
            if (mergeOption === KEYWORDS_MERGE_OPTIONS.MERGE) {
              keywords = deduplicateKeywords([...keywords, ...csvKeywords]);
            } else {
              keywords = csvKeywords;
            }
          }

          updatedListings.push({
            ...listing,
            title: getCsvFieldValue(row, headers, 'title', fallbackRow) || listing.title,
            description:
              getCsvFieldValue(row, headers, 'description', fallbackRow) || listing.description,
            isIllustration: normalizeBoolean(
              getCsvFieldValue(row, headers, 'isIllustration', fallbackRow),
              listing.isIllustration
            ),
            category: normalizeCategory(
              getCsvFieldValue(row, headers, 'category', fallbackRow),
              categories,
              listing.category
            ),
            usage:
              normalizeUsage(getCsvFieldValue(row, headers, 'usage', fallbackRow), usageOptions) ||
              listing.usage,
            releases: normalizeBoolean(
              getCsvFieldValue(row, headers, 'released', fallbackRow),
              listing.releases === 'yes'
            ),
            keywords,
            price: getCsvFieldValue(row, headers, 'price', fallbackRow)
              ? parseFloat(getCsvFieldValue(row, headers, 'price', fallbackRow))
              : listing.price,
          });
        }
      }
    });

    updatedListings.forEach(listing => onSaveListing(listing));

    void message.success('CSV processed successfully!');
  };

  return (
    <>
      <div className={css.root}>
        <Button
          type="link"
          target="_blank"
          href={BULK_UPLOAD_TEMPLATE_LINK}
          className={css.downloadLink}
        >
          <DownloadOutlined /> Use Template
        </Button>

        <Upload
          accept=".csv"
          beforeUpload={beforeUpload}
          customRequest={request => handleCsvFile(request)} // Custom handling
          maxCount={1}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />}>Upload CSV</Button>
        </Upload>
        <Tooltip title={csvUploadTooltip} className={css.tooltip}>
          <InfoCircleOutlined />
        </Tooltip>
      </div>

      <KeywordsMergeModal
        open={showModal}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        selectedOption={keywordsMergeOption}
        onOptionChange={handleOptionChange}
      />
    </>
  );
};
