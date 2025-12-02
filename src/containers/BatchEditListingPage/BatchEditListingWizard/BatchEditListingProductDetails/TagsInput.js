import React, { useState } from 'react';
import { Select } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { deduplicateKeywords } from '../../../../util/string';
import css from './EditListingBatchProductDetails.module.css';

const TagsInput = ({
  value = [],
  onChange,
  placeholder = '',
  maxSelection,
  disabled = false,
  className = '',
  style = {},
  ...restProps
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = tagsToCopy => {
    const copyText = Array.isArray(tagsToCopy) ? tagsToCopy.join(', ') : '';
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = copyText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      });
  };

  const handleChange = newValue => {
    // Deduplicate keywords (case-insensitive) and filter out empty strings
    const deduplicatedValue = Array.isArray(newValue) ? deduplicateKeywords(newValue) : newValue;

    if (onChange) {
      onChange(deduplicatedValue);
    }
  };

  const handlePaste = e => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      // Parse pasted keywords
      const newTags = deduplicateKeywords(pastedText);
      // Merge with existing tags, avoiding duplicates (case-insensitive)
      const existingTags = Array.isArray(value) ? deduplicateKeywords(value) : [];
      const mergedTags = deduplicateKeywords([...existingTags, ...newTags]);
      // Apply maxSelection limit if specified
      const finalTags = maxSelection ? mergedTags.slice(0, maxSelection) : mergedTags;
      if (onChange) {
        onChange(finalTags);
      }
    }
  };

  const handleCopyEvent = e => {
    e.preventDefault();
    const tagsToCopy = Array.isArray(value) ? value : [];
    handleCopy(tagsToCopy);
  };

  return (
    <div className={css.tagsContainer}>
      <Select
        mode="tags"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxTagCount={maxSelection}
        className={`${css.formItem} ${className}`}
        style={{ width: '100%', ...style }}
        tokenSeparators={[',']}
        suffixIcon={null}
        disabled={disabled}
        onPaste={handlePaste}
        onCopy={handleCopyEvent}
        {...restProps}
      />
      {Array.isArray(value) && value.length > 0 && !disabled && (
        <button
          type="button"
          className={`${css.copyButton} ${copyFeedback ? css.copied : ''}`}
          onClick={() => handleCopy(value)}
          title="Copy tags as comma-separated text"
        >
          <CopyOutlined />
        </button>
      )}
    </div>
  );
};

export default TagsInput;
