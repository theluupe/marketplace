import { CustomEditableTable, getLicensingGuideLink } from './CustomEditableTable';

export const EditableListingsTable = props => {
  // Simply pass through all props to the custom table component
  return <CustomEditableTable {...props} />;
};

// Re-export the function for backward compatibility
export { getLicensingGuideLink };
