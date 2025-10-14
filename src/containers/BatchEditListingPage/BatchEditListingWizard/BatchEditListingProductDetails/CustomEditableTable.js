import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pagination } from 'antd';
import imagePlaceholder from '../../../../assets/image-placeholder.jpg';
import { IconCaretDown, IconCaretUp, NamedLink } from '../../../../components';
import { EditableCell } from './EditableCellComponents';
import { FormattedMessage, useIntl } from 'react-intl';
import { getImageSizeLabel } from '../../imageHelpers';
import { TableHeaderTitle } from './TableHeaderTitle';
import { MAX_CATEGORIES, MAX_KEYWORDS } from '../../constants';

import css from './EditListingBatchProductDetails.module.css';
import customTableCss from './CustomEditableTable.module.css';

export const stringSorter = (a, b) => {
  const strA = a || '';
  const strB = b || '';
  return strA.toString().localeCompare(strB.toString(), 'en', { sensitivity: 'base' });
};

const numberSorter = (a, b) => {
  const numA = Number(a) || 0;
  const numB = Number(b) || 0;
  return numA - numB;
};

const getPricingGuideLink = () => (
  <NamedLink name="CMSPage" params={{ pageId: 'pricing-guide' }}>
    pricing guide.
  </NamedLink>
);

export const getLicensingGuideLink = () => (
  <NamedLink name="CMSPage" params={{ pageId: 'licensing-guide' }}>
    Learn More
  </NamedLink>
);

// Simple table header component
export const TableHeader = memo(
  ({ columns, sortConfig, onSort, onSelectAll, allSelected, partialSelected }) => {
    return (
      <table className={customTableCss.headerTable}>
        <thead>
          <tr>
            <th className={customTableCss.checkboxHeader}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = partialSelected;
                }}
                onChange={onSelectAll}
              />
            </th>
            {columns.map(column => (
              <th
                key={column.dataIndex}
                style={{ width: column.width }}
                className={`${customTableCss.tableHeader} ${
                  column.sorter ? customTableCss.sortableHeader : ''
                }`}
                onClick={column.sorter ? () => onSort(column.dataIndex, column.sorter) : undefined}
              >
                <div className={customTableCss.headerContent}>
                  {column.title}
                  {column.sorter && (
                    <span className={customTableCss.sortIndicator}>
                      <IconCaretUp
                        className={`${customTableCss.caretUp} ${
                          sortConfig?.key === column.dataIndex && sortConfig.direction === 'asc'
                            ? customTableCss.active
                            : ''
                        }`}
                      />
                      <IconCaretDown
                        className={`${customTableCss.caretDown} ${
                          sortConfig?.key === column.dataIndex && sortConfig.direction === 'desc'
                            ? customTableCss.active
                            : ''
                        }`}
                      />
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
      </table>
    );
  }
);

TableHeader.displayName = 'TableHeader';

export const TableRow = memo(({ record, columns, onSave, isSelected, onRowSelect }) => {
  return (
    <tr className={`${isSelected ? customTableCss.selectedRow : ''}`}>
      <td className={customTableCss.checkboxCell}>
        <input type="checkbox" checked={isSelected} onChange={() => onRowSelect(record.id)} />
      </td>
      {columns.map(column => {
        const value = record[column.dataIndex];
        const isEmpty = value === '—';
        if (column.editable) {
          return (
            <EditableCell
              key={`${record.id}-${column.dataIndex}`}
              record={record}
              editable={column.editable}
              dataIndex={column.dataIndex}
              title={column.title}
              handleSave={onSave}
              editControlType={column.editControlType}
              options={column.options}
              onBeforeSave={column.onBeforeSave}
              placeholder={column.placeholder}
              maxSelection={column.maxSelection}
              disabled={column.disabled}
              className={customTableCss.tableCell}
              style={{ width: column.width }}
            >
              {column.render ? column.render(value, record) : value || '—'}
            </EditableCell>
          );
        }
        return (
          <td
            key={`${record.id}-${column.dataIndex}`}
            className={customTableCss.tableCell}
            style={{ width: column.width }}
          >
            {column.render ? (
              column.render(value, record)
            ) : (
              <span
                className={`${css.cellContent} ${css.textarea} ${isEmpty ? css.emptyValue : ''}`}
              >
                {value || '—'}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

export const CustomEditableTable = memo(props => {
  const {
    onSave,
    listingFieldsOptions,
    onSelectChange,
    selectedRowKeys = [],
    listings = [],
    pageSize = 25,
    editMode = false,
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
    const licensingGuideLink = getLicensingGuideLink();
    const pricingGuideLink = getPricingGuideLink();
    const titleHelperText = intl.formatMessage({ id: 'EditableListingsTable.title.helperText' });
    const descriptionHelperText = intl.formatMessage({
      id: 'EditableListingsTable.description.helperText',
    });
    const isIllustrationHelperText = intl.formatMessage({
      id: 'EditableListingsTable.isIllustration.helperText',
    });
    const categoryHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.category.helperText' },
      { maxCategories: MAX_CATEGORIES }
    );
    const usageHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.usage.helperText' },
      { learnMore: licensingGuideLink }
    );
    const releasesHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.releases.helperText' },
      { learnMore: licensingGuideLink }
    );
    const keywordsHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.keywords.helperText' },
      { maxKeywords: MAX_KEYWORDS }
    );
    const priceHelperText = intl.formatMessage(
      { id: 'EditableListingsTable.price.helperText' },
      { pricingGuide: pricingGuideLink }
    );

    return [
      {
        title: intl.formatMessage({
          id: 'EditableListingsTable.columnThumbnail',
          defaultMessage: 'Thumbnail',
        }),
        dataIndex: 'preview',
        render: previewUrl => (
          <Image alt="Thumbnail" src={previewUrl} fallback={imagePlaceholder} width={200} />
        ),
        width: 250,
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

      ...(editMode
        ? [
            {
              title: (
                <TableHeaderTitle helperText={titleHelperText}>
                  <FormattedMessage id="EditableListingsTable.title" defaultMessage="Title" />
                </TableHeaderTitle>
              ),
              width: 400,
              dataIndex: 'title',
              editable: true,
              editControlType: 'text',
              sorter: stringSorter,
              placeholder: intl.formatMessage({
                id: 'EditableListingsTable.title.placeholder',
                defaultMessage: 'The listing title',
              }),
            },
            {
              title: (
                <TableHeaderTitle helperText={descriptionHelperText}>
                  <FormattedMessage
                    id="EditableListingsTable.description"
                    defaultMessage="Description"
                  />
                </TableHeaderTitle>
              ),
              dataIndex: 'description',
              width: 400,
              editable: true,
              editControlType: 'textarea',
              sorter: stringSorter,
              placeholder: intl.formatMessage({
                id: 'EditableListingsTable.description.placeholder',
                defaultMessage: 'The listing description',
              }),
            },
            {
              title: (
                <TableHeaderTitle helperText={keywordsHelperText}>
                  <FormattedMessage id="EditableListingsTable.keywords" defaultMessage="Keywords" />
                </TableHeaderTitle>
              ),
              width: 500,
              dataIndex: 'keywords',
              editable: true,
              editControlType: 'tags',
              maxSelection: MAX_KEYWORDS,
              placeholder: intl.formatMessage({
                id: 'EditableListingsTable.keywords.placeholder',
                defaultMessage: 'Up to 30 keywords',
              }),
            },
          ]
        : []),

      {
        title: (
          <TableHeaderTitle helperText={isIllustrationHelperText}>
            <FormattedMessage
              id="EditableListingsTable.isIllustration"
              defaultMessage="Is Illustration"
            />
          </TableHeaderTitle>
        ),
        dataIndex: 'isIllustration',
        width: 180,
        editable: true,
        editControlType: 'switch',
        disabled: record => record.isAi,
      },
      {
        title: (
          <TableHeaderTitle helperText={categoryHelperText}>
            <FormattedMessage id="EditableListingsTable.category" defaultMessage="Category" />
          </TableHeaderTitle>
        ),
        width: 300,
        dataIndex: 'category',
        editable: true,
        editControlType: 'selectMultiple',
        options: imageryCategoryOptions,
        maxSelection: MAX_CATEGORIES,
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.category.placeholder',
          defaultMessage: 'Up to 5 categories',
        }),
      },
      {
        title: (
          <TableHeaderTitle helperText={usageHelperText}>
            <FormattedMessage id="EditableListingsTable.usage" defaultMessage="Usage" />
          </TableHeaderTitle>
        ),
        width: 210,
        dataIndex: 'usage',
        editable: true,
        editControlType: 'select',
        options: usageOptions,
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.usage.placeholder',
          defaultMessage: 'Select the usage',
        }),
      },
      {
        title: (
          <TableHeaderTitle helperText={releasesHelperText}>
            <FormattedMessage
              id="EditableListingsTable.releases"
              defaultMessage="Do you have releases on file / can you obtain them?"
            />
          </TableHeaderTitle>
        ),
        dataIndex: 'releases',
        width: 320,
        editable: true,
        editControlType: 'switch',
      },
      {
        title: (
          <TableHeaderTitle>
            <FormattedMessage id="EditableListingsTable.imageSize" defaultMessage="Image Size" />
          </TableHeaderTitle>
        ),
        dataIndex: 'imageSize',
        width: 240,
        render: value => <span className={css.cellContent}>{getImageSizeLabel(value)}</span>,
        sorter: stringSorter,
      },
      {
        title: (
          <TableHeaderTitle>
            <FormattedMessage id="EditableListingsTable.dimensions" defaultMessage="Dimensions" />
          </TableHeaderTitle>
        ),
        dataIndex: 'dimensions',
        width: 200,
      },
      {
        title: (
          <TableHeaderTitle helperText={priceHelperText}>
            <FormattedMessage id="EditableListingsTable.price" defaultMessage="Price" />
          </TableHeaderTitle>
        ),
        dataIndex: 'price',
        width: 160,
        editable: true,
        editControlType: 'money',
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.price.placeholder',
          defaultMessage: 'Enter the price',
        }),
        sorter: numberSorter,
      },
    ];
  }, [intl, imageryCategoryOptions, usageOptions]);

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
    if (editMode) {
      return sortedListings;
    }
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
      <div className={customTableCss.topPaginationContainer}>
        {!editMode && (
          <>
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
          </>
        )}
      </div>

      <div className={`${customTableCss.stickyHeader} ${editMode ? customTableCss.editMode : ''}`}>
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
        {!editMode && (
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
        )}
      </div>
    </div>
  );
});

CustomEditableTable.displayName = 'CustomEditableTable';
