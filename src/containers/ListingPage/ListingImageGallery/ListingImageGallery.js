import React, { useState, useRef } from 'react';
import { message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import classNames from 'classnames';
import ReactImageGallery from 'react-image-gallery';

import { propTypes } from '../../../util/types';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import {
  AspectRatioWrapper,
  Button,
  IconClose,
  IconArrowHead,
  ResponsiveImage,
  IconExpand,
} from '../../../components';

// Copied directly from
// `node_modules/react-image-gallery/styles/css/image-gallery.css`. The
// copied file is left unedited, and all the overrides are defined in
// the component CSS file below.
import './image-gallery.css';

import css from './ListingImageGallery.module.css';

const IMAGE_GALLERY_OPTIONS = {
  showPlayButton: false,
  showBullets: false,
  showThumbnails: false,
  showNav: false,
  disableThumbnailScroll: true,
};
const MAX_LANDSCAPE_ASPECT_RATIO = 2; // 2:1
const MAX_PORTRAIT_ASPECT_RATIO = 4 / 3;

const getFirstImageAspectRatio = (firstImage, scaledVariant) => {
  if (!firstImage) {
    return { aspectWidth: 1, aspectHeight: 1 };
  }

  const v = firstImage?.attributes?.variants?.[scaledVariant];
  const w = v?.width;
  const h = v?.height;
  const hasDimensions = !!w && !!h;
  const aspectRatio = w / h;

  // We keep the fractions separated as these are given to AspectRatioWrapper
  // which expects separate width and height
  return hasDimensions && aspectRatio >= MAX_LANDSCAPE_ASPECT_RATIO
    ? { aspectWidth: 2, aspectHeight: 1 }
    : hasDimensions && aspectRatio <= MAX_PORTRAIT_ASPECT_RATIO
    ? { aspectWidth: 4, aspectHeight: 3 }
    : hasDimensions
    ? { aspectWidth: w, aspectHeight: h }
    : { aspectWidth: 1, aspectHeight: 1 };
};

/**
 * The ListingImageGallery component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {Array<propTypes.image>} props.images - The images
 * @param {Array<string>} props.imageVariants - The image variants
 * @param {Array<string>} props.thumbnailVariants - The thumbnail variants
 * @returns {JSX.Element} listing image gallery component
 */
const ListingImageGallery = props => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const downloadButtonRef = useRef(null);
  const intl = useIntl();
  const { rootClassName, className, images, imageVariants, thumbnailVariants, listingId } = props;
  const thumbVariants = thumbnailVariants || imageVariants;
  // imageVariants are scaled variants.
  const { aspectWidth, aspectHeight } = getFirstImageAspectRatio(images?.[0], imageVariants[0]);
  const items = images.map((img, i) => {
    return {
      // We will only use the image resource, but react-image-gallery
      // requires the `original` key from each item.
      original: '',
      alt: intl.formatMessage(
        { id: 'ListingImageGallery.imageAltText' },
        { index: i + 1, count: images.length }
      ),
      thumbAlt: intl.formatMessage(
        { id: 'ListingImageGallery.imageThumbnailAltText' },
        { index: i + 1, count: images.length }
      ),
      thumbnail: img.attributes?.variants?.[thumbVariants[0]],
      image: img,
    };
  });
  const imageSizesMaybe = isFullscreen
    ? {}
    : { sizes: `(max-width: 1024px) 100vw, (max-width: 1200px) calc(100vw - 192px), 708px` };
  const renderItem = item => {
    return (
      <AspectRatioWrapper
        width={aspectWidth || 1}
        height={aspectHeight || 1}
        className={isFullscreen ? css.itemWrapperFullscreen : css.itemWrapper}
      >
        <div className={css.itemCentering}>
          <ResponsiveImage
            rootClassName={css.item}
            image={item.image}
            alt={item.alt}
            variants={imageVariants}
            {...imageSizesMaybe}
          />
        </div>
      </AspectRatioWrapper>
    );
  };
  const renderThumbInner = item => {
    return (
      <div>
        <ResponsiveImage
          rootClassName={css.thumb}
          image={item.image}
          alt={item.thumbAlt}
          variants={thumbVariants}
          sizes="88px"
        />
      </div>
    );
  };

  const onScreenChange = isFull => {
    setIsFullscreen(isFull);
  };

  const renderLeftNav = (onClick, disabled) => {
    return (
      <button className={css.navLeft} disabled={disabled} onClick={onClick}>
        <div className={css.navArrowWrapper}>
          <IconArrowHead direction="left" size="big" />
        </div>
      </button>
    );
  };
  const renderRightNav = (onClick, disabled) => {
    return (
      <button className={css.navRight} disabled={disabled} onClick={onClick}>
        <div className={css.navArrowWrapper}>
          <IconArrowHead direction="right" size="big" />
        </div>
      </button>
    );
  };

  const handleDownload = async () => {
    const errorMsg = intl.formatMessage({ id: 'ListingImageGallery.downloadCompError' });
    const successMsg = intl.formatMessage({ id: 'ListingImageGallery.downloadCompSuccess' });
    if (!items[0] || !listingId) {
      messageApi.error(errorMsg);
      return;
    }
    const image = items[0].image;
    const variants = image?.attributes?.variants || {};
    const variantKey = 'scaled-large';
    const url = variants[variantKey]?.url || Object.values(variants)[0]?.url;
    if (!url) {
      messageApi.error(errorMsg);
      return;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `TL_Unlicensed_Comp_${listingId}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      messageApi.success(successMsg);
    } catch (e) {
      messageApi.error(errorMsg);
    } finally {
      // Ensure button returns to normal state
      if (downloadButtonRef.current) {
        downloadButtonRef.current.blur();
      }
    }
  };

  const renderFullscreenButton = (onClick, isFullscreen) => {
    if (isFullscreen) {
      return (
        <Button
          onClick={onClick}
          rootClassName={css.close}
          title={intl.formatMessage({ id: 'ListingImageGallery.closeModalTitle' })}
        >
          <span className={css.closeText}>
            <FormattedMessage id="ListingImageGallery.closeModal" />
          </span>
          <IconClose rootClassName={css.closeIcon} />
        </Button>
      );
    } else {
      return (
        <div className={css.ctaWrapper}>
          <button
            ref={downloadButtonRef}
            className={css.ctaButton}
            onClick={handleDownload}
            type="button"
          >
            <DownloadOutlined /> <FormattedMessage id="ListingImageGallery.downloadCompButton" />
          </button>
          <button className={css.ctaButton} onClick={onClick}>
            <IconExpand /> <FormattedMessage id="ListingImageGallery.viewImagesButton" />
          </button>
        </div>
      );
    }
  };

  if (items.length === 0) {
    return <ResponsiveImage className={css.noImage} image={null} variants={[]} alt="" />;
  }

  const classes = classNames(rootClassName || css.root, className);

  return (
    <>
      {contextHolder}
      <ReactImageGallery
        additionalClass={classes}
        items={items}
        renderItem={renderItem}
        renderThumbInner={renderThumbInner}
        onScreenChange={onScreenChange}
        renderLeftNav={renderLeftNav}
        renderRightNav={renderRightNav}
        renderFullscreenButton={renderFullscreenButton}
        {...IMAGE_GALLERY_OPTIONS}
      />
    </>
  );
};

export default ListingImageGallery;
