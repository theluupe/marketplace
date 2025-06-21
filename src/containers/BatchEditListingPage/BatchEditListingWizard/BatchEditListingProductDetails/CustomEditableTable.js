import React, { useState, useCallback, useMemo, memo } from 'react';
import { Flex, Image } from 'antd';
import imagePlaceholder from '../../../../assets/image-placeholder.jpg';
import { NamedLink } from '../../../../components';
import { EditableCell } from './EditableCellComponents';
import { FormattedMessage, useIntl } from 'react-intl';
import { getImageSizeLabel } from '../../imageHelpers';
import { CsvUpload } from '../CsvUpload/CsvUpload';
import { TableHeaderTitle } from './TableHeaderTitle';
import { MAX_CATEGORIES, MAX_KEYWORDS } from '../../constants';

import css from './EditListingBatchProductDetails.module.css';
import customTableCss from './CustomEditableTable.module.css';

const stringSorter = (a, b) => {
  // Handle null/undefined values
  const strA = a || '';
  const strB = b || '';
  return strA.toString().localeCompare(strB.toString(), 'en', { sensitivity: 'base' });
};

const numberSorter = (a, b) => {
  // Handle null/undefined values and convert to numbers
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
    Learn More.
  </NamedLink>
);

// Simple table header component
const TableHeader = memo(({ columns, sortConfig, onSort, onSelectAll, allSelected, partialSelected }) => {
  return (
    <thead className={customTableCss.stickyHeader}>
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
        {columns.map((column) => (
          <th 
            key={column.dataIndex}
            style={{ width: column.width }}
            className={`${customTableCss.tableHeader} ${column.sorter ? customTableCss.sortableHeader : ''}`}
            onClick={column.sorter ? () => onSort(column.dataIndex, column.sorter) : undefined}
          >
            <div className={customTableCss.headerContent}>
              {column.title}
              {column.sorter && sortConfig?.key === column.dataIndex && (
                <span className={customTableCss.sortIndicator}>
                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
});

TableHeader.displayName = 'TableHeader';

// Table row component with editable cell support
const TableRow = memo(({ 
  record, 
  columns, 
  onSave,
  isSelected, 
  onRowSelect,
}) => {
  return (
    <tr 
      className={`${isSelected ? customTableCss.selectedRow : ''}`}
    >
      <td className={customTableCss.checkboxCell}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onRowSelect(record.id)}
        />
      </td>
      {columns.map((column) => {
        const value = record[column.dataIndex];
        
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
            {column.render ? column.render(value, record) : value || '—'}
          </td>
        );
      })}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

export const CustomEditableTable = memo((props) => {
  const {
    onSave,
    listingFieldsOptions,
    onSelectChange,
    selectedRowKeys = [],
    listings = [],
    loading = false,
  } = props;
  
  const intl = useIntl();
  const { categories: imageryCategoryOptions, usages: usageOptions } = listingFieldsOptions;

  const [sortConfig, setSortConfig] = useState(null);

  const handleSave = useCallback((updatedData) => {
    onSave(updatedData);
  }, [onSave]);

  const handleSort = useCallback((key, sorter) => {
    setSortConfig(prevConfig => {
      if (prevConfig?.key === key) {
        return {
          key,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc',
          sorter
        };
      }
      return { key, direction: 'asc', sorter };
    });
  }, []);

  const handleRowSelect = useCallback((id) => {
    const newSelectedKeys = selectedRowKeys.includes(id)
      ? selectedRowKeys.filter(key => key !== id)
      : [...selectedRowKeys, id];
    onSelectChange(newSelectedKeys);
  }, [selectedRowKeys, onSelectChange]);

  const handleSelectAll = useCallback(() => {
    const allIds = listings.map(listing => listing.id);
    const newSelectedKeys = selectedRowKeys.length === allIds.length ? [] : allIds;
    onSelectChange(newSelectedKeys);
  }, [listings, selectedRowKeys, onSelectChange]);

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
            <FormattedMessage id="EditableListingsTable.description" defaultMessage="Description" />
          </TableHeaderTitle>
        ),
        dataIndex: 'description',
        width: 300,
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
          <TableHeaderTitle helperText={isIllustrationHelperText}>
            <FormattedMessage
              id="EditableListingsTable.isIllustration"
              defaultMessage="Is Illustration"
            />
          </TableHeaderTitle>
        ),
        dataIndex: 'isIllustration',
        width: 200,
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
        width: 200,
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
        width: 300,
        editable: true,
        editControlType: 'switch',
      },
      {
        title: (
          <TableHeaderTitle helperText={keywordsHelperText}>
            <FormattedMessage id="EditableListingsTable.keywords" defaultMessage="Keywords" />
          </TableHeaderTitle>
        ),
        width: 400,
        dataIndex: 'keywords',
        editable: true,
        editControlType: 'tags',
        maxSelection: MAX_KEYWORDS,
        placeholder: intl.formatMessage({
          id: 'EditableListingsTable.keywords.placeholder',
          defaultMessage: 'Up to 30 keywords',
        }),
      },
      {
        title: (
          <TableHeaderTitle>
            <FormattedMessage id="EditableListingsTable.imageSize" defaultMessage="Image Size" />
          </TableHeaderTitle>
        ),
        dataIndex: 'imageSize',
        width: 260,
        render: getImageSizeLabel,
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
        width: 200,
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

  // Sorted data
  const sortedListings = useMemo(() => {
    if (!sortConfig) return listings;

    return [...listings].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      const result = sortConfig.sorter(aVal, bVal);
      return sortConfig.direction === 'desc' ? -result : result;
    });
  }, [listings, sortConfig]);

  const allSelected = selectedRowKeys.length === listings.length && listings.length > 0;
  const partialSelected = selectedRowKeys.length > 0 && !allSelected;

  if (loading) {
    return (
      <div className={customTableCss.loadingContainer}>
        <div className={customTableCss.spinner}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Flex className={css.csvUploadWrapper}>
        <CsvUpload
          categories={imageryCategoryOptions}
          usageOptions={usageOptions}
          onSaveListing={onSave}
        />
      </Flex>
      <div className={customTableCss.tableContainer}>
        <table className={customTableCss.customTable}>
          <TableHeader
            columns={columns}
            sortConfig={sortConfig}
            onSort={handleSort}
            onSelectAll={handleSelectAll}
            allSelected={allSelected}
            partialSelected={partialSelected}
          />
          <tbody>
            {sortedListings.map((record, index) => (
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
  );
});

CustomEditableTable.displayName = 'CustomEditableTable'; 