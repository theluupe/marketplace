import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Flex, Image, Pagination } from 'antd';

import imagePlaceholder from '../../../../assets/image-placeholder.jpg';
import { MAX_KEYWORDS } from '../../constants';
import {
  stringSorter,
  TableHeader,
  TableRow,
} from '../BatchEditListingProductDetails/CustomEditableTable';
import { TableHeaderTitle } from '../BatchEditListingProductDetails/TableHeaderTitle';
import { CsvUpload } from '../CsvUpload/CsvUpload';

import css from '../BatchEditListingProductDetails/EditListingBatchProductDetails.module.css';
import customTableCss from '../BatchEditListingProductDetails/CustomEditableTable.module.css';

export const CustomEditableTable = memo(props => {
  const {
    onSave,
    listingFieldsOptions,
    onSelectChange,
    selectedRowKeys = [],
    listings = [],
    pageSize = 25,
  } = props;
  const {
    categories: imageryCategoryOptions = [],
    usages: usageOptions = [],
  } = listingFieldsOptions;
  const intl = useIntl();

  const [sortConfig, setSortConfig] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Refs for synchronized scrolling
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);

  const handleSave = useCallback(onSave, [onSave]);

  const handleSort = useCallback((key, sorter) => {
    setSortConfig(prevConfig => {
      if (prevConfig?.key === key) {
        return {
          key,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc',
          sorter,
        };
      }
      return { key, direction: 'asc', sorter };
    });
  }, []);

  const handleRowSelect = useCallback(
    recordId => {
      const newSelectedKeys = selectedRowKeys.includes(recordId)
        ? selectedRowKeys.filter(key => key !== recordId)
        : [...selectedRowKeys, recordId];
      onSelectChange(newSelectedKeys);
    },
    [selectedRowKeys, onSelectChange]
  );

  const handlePageChange = useCallback(page => {
    setCurrentPage(page);
  }, []);

  // Sync scroll between header and body
  useEffect(() => {
    const headerElement = headerScrollRef.current;
    const bodyElement = bodyScrollRef.current;

    if (!headerElement || !bodyElement) return;

    const handleScroll = () => {
      headerElement.scrollLeft = bodyElement.scrollLeft;
    };

    bodyElement.addEventListener('scroll', handleScroll);
    return () => bodyElement.removeEventListener('scroll', handleScroll);
  }, []);

  // Full columns configuration with editable functionality
  const columns = useMemo(() => {
    const titleHelperText = intl.formatMessage({ id: 'EditableListingsTable.title.helperText' });
    const descriptionHelperText = intl.formatMessage({
      id: 'EditableListingsTable.description.helperText',
    });
    const keywordsHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.keywords.helperText' },
      { maxKeywords: MAX_KEYWORDS }
    );
    return [
      {
        title: intl.formatMessage({
          id: 'EditableListingsTable.columnThumbnail',
          defaultMessage: 'Thumbnail',
        }),
        dataIndex: 'preview',
        width: 250,
        render: previewUrl => (
          <Image alt="Thumbnail" src={previewUrl} fallback={imagePlaceholder} width={200} />
        ),
      },
      {
        title: intl.formatMessage({
          id: 'EditableListingsTable.fileName',
          defaultMessage: 'File Name',
        }),
        dataIndex: 'name',
        width: 300,
        sorter: stringSorter,
      },
      {
        title: (
          <TableHeaderTitle helperText={titleHelperText}>
            <FormattedMessage id="EditableListingsTable.title" defaultMessage="Title" />
          </TableHeaderTitle>
        ),
        dataIndex: 'title',
        width: 400,
        editable: true,
        editControlType: 'textarea',
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.title.placeholder',
          defaultMessage: 'The listing title',
        }),
        sorter: stringSorter,
      },
      {
        title: (
          <TableHeaderTitle helperText={descriptionHelperText}>
            <FormattedMessage id="EditableListingsTable.description" defaultMessage="Description" />
          </TableHeaderTitle>
        ),
        dataIndex: 'description',
        width: 400,
        editable: true,
        editControlType: 'textarea',
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.description.placeholder',
          defaultMessage: 'The listing description',
        }),
        sorter: stringSorter,
      },
      {
        title: (
          <TableHeaderTitle helperText={keywordsHelperText}>
            <FormattedMessage id="EditableListingsTable.keywords" defaultMessage="Keywords" />
          </TableHeaderTitle>
        ),
        dataIndex: 'keywords',
        width: 600,
        editable: true,
        editControlType: 'tags',
        maxSelection: MAX_KEYWORDS,
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.keywords.placeholder',
          defaultMessage: 'Up to 30 keywords',
        }),
      },
    ];
  }, [intl]);

  const sortedListings = useMemo(() => {
    if (!sortConfig) return listings;
    return [...listings].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      const result = sortConfig.sorter(aVal, bVal);
      return sortConfig.direction === 'desc' ? -result : result;
    });
  }, [listings, sortConfig]);

  const paginatedListings = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedListings.slice(startIndex, endIndex);
  }, [sortedListings, currentPage, pageSize]);

  const allItemIds = useMemo(() => listings.map(listing => listing.id), [listings]);

  const allItemsSelectedCount = useMemo(
    () => allItemIds.filter(id => selectedRowKeys.includes(id)).length,
    [allItemIds, selectedRowKeys]
  );

  // Update selection logic for all pages
  const allItemsSelected = allItemsSelectedCount === allItemIds.length && allItemIds.length > 0;
  const partialItemsSelected = allItemsSelectedCount > 0 && !allItemsSelected;

  // Define handleSelectAll to work across all pages
  const handleSelectAll = useCallback(() => {
    // Toggle selection for all items across all pages
    const newSelectedKeys = allItemsSelected
      ? [] // Deselect all items
      : [...allItemIds]; // Select all items
    onSelectChange(newSelectedKeys);
  }, [allItemsSelected, allItemIds, onSelectChange]);

  return (
    <div>
      <Flex className={css.csvUploadWrapper}>
        <CsvUpload
          categories={imageryCategoryOptions}
          usageOptions={usageOptions}
          onSaveListing={onSave}
        />
      </Flex>

      <div className={customTableCss.topPaginationContainer}>
        <div className={customTableCss.topPaginationInfo}>
          {`Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(
            currentPage * pageSize,
            listings.length
          )} of ${listings.length} items`}
        </div>
        <div className={customTableCss.topPaginationControls}>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={listings.length}
            onChange={handlePageChange}
            showSizeChanger={false}
            showQuickJumper={listings.length > pageSize * 5}
            showTotal={false}
            className={customTableCss.pagination}
          />
        </div>
      </div>

      <div className={customTableCss.stickyHeader}>
        <div className={customTableCss.tableHeaderInner} ref={headerScrollRef}>
          <TableHeader
            columns={columns}
            sortConfig={sortConfig}
            onSort={handleSort}
            onSelectAll={handleSelectAll}
            allSelected={allItemsSelected}
            partialSelected={partialItemsSelected}
          />
        </div>
      </div>

      <div className={customTableCss.tableContainer} ref={bodyScrollRef}>
        <div>
          <table className={customTableCss.bodyTable}>
            <tbody>
              {paginatedListings.map((record, index) => (
                <TableRow
                  key={record.id}
                  record={record}
                  columns={columns}
                  onSave={handleSave}
                  isSelected={selectedRowKeys.includes(record.id)}
                  onRowSelect={handleRowSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={customTableCss.paginationContainer}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={listings.length}
          onChange={handlePageChange}
          showSizeChanger={false}
          showQuickJumper={listings.length > pageSize * 5}
          showTotal={false}
          className={customTableCss.pagination}
        />
      </div>
    </div>
  );
});

CustomEditableTable.displayName = 'CustomEditableTable';
