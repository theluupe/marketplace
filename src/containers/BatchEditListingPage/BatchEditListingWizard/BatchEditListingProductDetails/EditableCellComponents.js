import React, { useEffect, useRef, useState } from 'react';
import { Input, InputNumber, Select, Switch } from 'antd';
import { NamedLink } from '../../../../components';
import css from './EditListingBatchProductDetails.module.css';
import { EditOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const EditableCell = ({
  title,
  editable,
  dataIndex,
  record = {}, // Default to an empty object to avoid undefined errors
  handleSave,
  editControlType,
  options,
  placeholder = '',
  maxSelection,
  onBeforeSave,
  disabled = () => false,
  children, // Content for non-editable cells
  ...restProps
}) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef(null);

  const value = record[dataIndex] !== undefined ? record[dataIndex] : '';

  useEffect(() => {
    if (editing) {
      setTempValue(value);
      // Focus the input after it's rendered
      setTimeout(() => {
        if (inputRef.current) {
          if (inputRef.current.focus) {
            inputRef.current.focus();
          } else if (inputRef.current.input && inputRef.current.input.focus) {
            inputRef.current.input.focus();
          }
        }
      }, 0);
    }
  }, [editing, value]);

  const toggleEdit = () => {
    setEditing(!editing);
  };

  const save = () => {
    setEditing(false);
    const values = { ...record, [dataIndex]: tempValue };
    const updatedValues = onBeforeSave ? onBeforeSave(values) : values;

    if (handleSave && tempValue !== value) {
      handleSave(updatedValues);
    }
  };

  const cancel = () => {
    setEditing(false);
    setTempValue(value);
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter' && editControlType !== 'textarea') {
      save();
    } else if (e.key === 'Escape') {
      cancel();
    }
  };

  const renderDisplayValue = () => {
    switch (editControlType) {
      case 'selectMultiple':
        if (Array.isArray(value) && value.length > 0) {
          return value
            .map(v => {
              const option = options?.find(opt => opt.value === v);
              return option ? option.label : v;
            })
            .join(', ');
        }
        return placeholder || '—';

      case 'select':
        if (value) {
          const option = options?.find(opt => opt.value === value);
          return option ? option.label : value;
        }
        return placeholder || '—';

      case 'tags':
        if (Array.isArray(value) && value.length > 0) {
          return value.join(', ');
        }
        return placeholder || '—';

      case 'switch':
        return value ? 'Yes' : 'No';

      case 'money':
        return value ? `$${value}` : '—';

      case 'text':
      case 'textarea':
        return value || '—';

      default:
        return value || '—';
    }
  };

  const renderEditableField = () => {
    switch (editControlType) {
      case 'text':
        return (
          <Input
            ref={inputRef}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            className={css.formItem}
          />
        );
      case 'textarea':
        return (
          <TextArea
            ref={inputRef}
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyPress}
            autoSize={{ minRows: 1, maxRows: 6 }}
            placeholder={placeholder}
            className={css.formItem}
          />
        );
      case 'selectMultiple':
        return (
          <Select
            ref={inputRef}
            value={tempValue}
            mode="multiple"
            options={options}
            onChange={setTempValue}
            onBlur={save}
            placeholder={placeholder}
            maxCount={maxSelection}
            className={css.formItem}
            style={{ width: '100%' }}
            open={true}
          />
        );
      case 'select':
        return (
          <Select
            ref={inputRef}
            value={tempValue}
            options={options}
            onChange={val => {
              setTempValue(val);
              setTimeout(() => {
                const values = { ...record, [dataIndex]: val };
                const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
                if (handleSave) {
                  handleSave(updatedValues);
                }
                setEditing(false);
              }, 100);
            }}
            placeholder={placeholder}
            className={css.formItem}
            style={{ width: '100%' }}
            open={true}
          />
        );
      case 'tags':
        return (
          <Select
            ref={inputRef}
            mode="tags"
            value={tempValue}
            onChange={newValue => {
              // Filter out empty strings and whitespace-only strings
              const filteredValue = Array.isArray(newValue) 
                ? newValue.filter(tag => tag && tag.trim().length > 0)
                : newValue;
              setTempValue(filteredValue);
            }}
            onBlur={save}
            placeholder={placeholder}
            maxTagCount={maxSelection}
            className={css.formItem}
            style={{ width: '100%' }}
            open={true}
          />
        );
      case 'switch':
        return (
          <Switch
            ref={inputRef}
            checked={!!tempValue}
            onChange={checked => {
              setTempValue(checked);
              setTimeout(() => {
                const values = { ...record, [dataIndex]: checked };
                const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
                if (handleSave) {
                  handleSave(updatedValues);
                }
                setEditing(false);
              }, 100);
            }}
            checkedChildren="Yes"
            unCheckedChildren="No"
            className={css.formItem}
            disabled={disabled(record)}
          />
        );
      case 'money':
        return (
          <InputNumber
            ref={inputRef}
            value={tempValue}
            onChange={setTempValue}
            onBlur={save}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            formatter={val => `$ ${val}`}
            className={css.formItem}
          />
        );
      default:
        return null;
    }
  };

  const renderCell = () => {
    if (!editable) {
      return children;
    }

    // Always show Switch component for switch type, never in edit mode
    if (editControlType === 'switch') {
      return (
        <Switch
          checked={!!value}
          onChange={checked => {
            const values = { ...record, [dataIndex]: checked };
            const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
            if (handleSave) {
              handleSave(updatedValues);
            }
          }}
          checkedChildren="Yes"
          unCheckedChildren="No"
          className={css.formItem}
          disabled={disabled(record)}
        />
      );
    }

    // Always show Select components for select types, never in edit mode
    if (editControlType === 'select') {
      return (
        <Select
          value={value}
          options={options}
          onChange={val => {
            const values = { ...record, [dataIndex]: val };
            const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
            if (handleSave) {
              handleSave(updatedValues);
            }
          }}
          placeholder={placeholder}
          className={css.formItem}
          style={{ width: '100%' }}
        />
      );
    }

    if (editControlType === 'selectMultiple') {
      return (
        <Select
          value={value}
          mode="multiple"
          options={options}
          onChange={newValue => {
            const values = { ...record, [dataIndex]: newValue };
            const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
            if (handleSave) {
              handleSave(updatedValues);
            }
          }}
          placeholder={placeholder}
          maxCount={maxSelection}
          className={css.formItem}
          style={{ width: '100%' }}
        />
      );
    }

    if (editControlType === 'tags') {
      return (
        <Select
          mode="tags"
          value={value}
          onChange={newValue => {
            // Filter out empty strings and whitespace-only strings
            const filteredValue = Array.isArray(newValue) 
              ? newValue.filter(tag => tag && tag.trim().length > 0)
              : newValue;
            
            const values = { ...record, [dataIndex]: filteredValue };
            const updatedValues = onBeforeSave ? onBeforeSave(values) : values;
            if (handleSave) {
              handleSave(updatedValues);
            }
          }}
          placeholder={placeholder}
          maxTagCount={maxSelection}
          className={css.formItem}
          style={{ width: '100%' }}
        />
      );
    }

    if (editing) {
      if (editControlType === 'money') {
        return (
          <div className={css.moneyFieldContainer}>
            {renderEditableField()}
            <div className={css.moneyFieldPricingGuide}>
              <NamedLink name="CMSPage" params={{ pageId: 'pricing-guide' }} target="_blank">
                Pricing guide
              </NamedLink>
            </div>
          </div>
        );
      }
      return renderEditableField();
    }

    if (editControlType === 'money') {
      return (
        <div className={css.moneyFieldContainer}>
          <div className={`${css.editableCell} ${css.moneyField}`} onClick={toggleEdit}>
            <span className={css.cellContent}>{renderDisplayValue()}</span>
            <EditOutlined />
          </div>
          <div className={css.moneyFieldPricingGuide}>
            <NamedLink name="CMSPage" params={{ pageId: 'pricing-guide' }} target="_blank">
              Pricing guide
            </NamedLink>
          </div>
        </div>
      );
    }

    const displayValue = renderDisplayValue();
    const isEmpty = displayValue === '—';
    const isTextarea = editControlType === 'textarea';
    
    return (
      <div className={css.editableCell} onClick={toggleEdit}>
        <span className={`${css.cellContent} ${isEmpty ? css.emptyValue : ''} ${isTextarea ? css.textarea : ''}`}>
          {displayValue}
        </span>
        <EditOutlined />
      </div>
    );
  };

  return <td {...restProps}>{renderCell()}</td>;
};

const EditableRow = ({ index, ...props }) => {
  return <tr {...props} />;
};

export const EditableCellComponents = {
  body: {
    row: EditableRow,
    cell: EditableCell,
  },
  Cell: EditableCell, // Direct export for our custom table
  Row: EditableRow,
};

// Also export directly for easier importing
export { EditableCell, EditableRow };
