import Masonry, { ResponsiveMasonry } from 'react-responsive-masonry';
import React from 'react';

const MasonryGridWrapper = ({ children }) => {
  if (!children) {
    return null;
  }

  return (
    // Two columns from 550 px, like the square grids (ListingTabs and SearchResultsPanel CSS): both layouts get the
    // same column widths, so the 400 px portfolio grid image (util/portfolioImage.js) suits both. Was 750 px, which
    // left masonry in one column up to ~700 px wide. Breakpoints are window widths.
    <ResponsiveMasonry
      columnsCountBreakPoints={{ 350: 1, 550: 2, 900: 3 }}
      gutterBreakpoints={{ 350: '12px', 550: '16px', 900: '24px' }}
    >
      <Masonry gutter="12px">{children}</Masonry>
    </ResponsiveMasonry>
  );
};

export default MasonryGridWrapper;
