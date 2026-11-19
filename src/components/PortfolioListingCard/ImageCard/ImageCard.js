import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { Image } from 'antd';

import imagePlaceholder from '../../../assets/image-placeholder.jpg';
import { useConfiguration } from '../../../context/configurationContext';
import { AspectRatioWrapperMaybe } from '../../../components';

import css from './ImageCard.module.css';
import { GRID_STYLE_MASONRY, GRID_STYLE_SQUARE } from '../../../util/types';
import { PORTFOLIO_GRID_VARIANT } from '../../../util/portfolioImage';

export const ImageCard = props => {
  const config = useConfiguration();
  const { className = null, rootClassName = null, item, gridLayout = GRID_STYLE_SQUARE } = props;
  const classes = classNames(rootClassName || css.root, className);

  // Handle images
  const title = item?.attributes?.title || 'portfolio-image';
  const { aspectWidth = 1, aspectHeight = 1 } = config.layout.listingImage;

  const isSquareLayout = gridLayout === GRID_STYLE_SQUARE;
  const imageVariants = item?.attributes?.variants || {};
  // Both layouts show the same uncropped 400 px file (util/portfolioImage.js), so switching layouts downloads nothing
  // new. The 750 px image (scaled-medium) loads only when the preview opens.
  const gridImage = imageVariants[PORTFOLIO_GRID_VARIANT];
  const previewSrc = imageVariants['scaled-medium']?.url;
  // Images load only when they near the screen (loading="lazy"). Masonry: each one keeps its height free before it
  // loads; unsized, a lazy image is 0 px tall, so every one counts as on screen and they all load at once. Square:
  // AspectRatioWrapperMaybe keeps the space, and the image is cropped to it here. Inline styles, so AntD's own image
  // CSS (width 100%, height auto) doesn't win.
  const imageStyle = isSquareLayout
    ? { width: '100%', height: '100%', objectFit: 'cover' }
    : gridImage?.width && gridImage?.height
    ? { aspectRatio: `${gridImage.width} / ${gridImage.height}` }
    : undefined;
  const wrapperStyle = isSquareLayout ? { width: '100%', height: '100%' } : undefined;

  return (
    <div className={classes}>
      <AspectRatioWrapperMaybe
        width={aspectWidth}
        height={aspectHeight}
        isSquareLayout={isSquareLayout}
      >
        <Image
          src={gridImage?.url}
          alt={title}
          loading="lazy"
          style={imageStyle}
          wrapperStyle={wrapperStyle}
          fallback={imagePlaceholder}
          preview={{ src: previewSrc }}
        />
      </AspectRatioWrapperMaybe>
    </div>
  );
};

ImageCard.propTypes = {
  className: PropTypes.string,
  gridLayout: PropTypes.oneOf([GRID_STYLE_SQUARE, GRID_STYLE_MASONRY]),
  item: PropTypes.shape({
    attributes: PropTypes.object,
  }).isRequired,
};

export default ImageCard;
