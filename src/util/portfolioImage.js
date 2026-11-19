import { createImageVariantConfig } from './sdkLoader';

/**
 * The portfolio grid image: one uncropped file, 400 px wide, for both grid layouts. The square layout crops it in CSS
 * (PortfolioListingCard/ImageCard), so switching layouts downloads nothing new. The 750 px `scaled-medium` loads only
 * when a preview opens. Its box is 400 × 1200 with `fit: scale`: 400 px wide for any image up to three times as tall
 * as it is wide. See spec/v0/hide-portfolio.md §9.
 */
export const PORTFOLIO_GRID_VARIANT = 'portfolio-grid';

// What a portfolio listings query adds, next to its other image variants.
export const portfolioGridImageField = `variants.${PORTFOLIO_GRID_VARIANT}`;
export const portfolioGridImageVariant = createImageVariantConfig(
  PORTFOLIO_GRID_VARIANT,
  400,
  3,
  'scale'
);
