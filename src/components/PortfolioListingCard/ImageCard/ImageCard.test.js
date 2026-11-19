import React, { act } from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';
import { GRID_STYLE_MASONRY, GRID_STYLE_SQUARE } from '../../../util/types';

import { ImageCard } from './ImageCard';

const { screen, fireEvent } = testingLibrary;

// A portrait photo, as the portfolio queries return it (ProfilePage.duck.js, ManageListingsPage.duck.js).
const item = {
  id: { uuid: 'image-1' },
  type: 'image',
  attributes: {
    title: 'Summer collection',
    variants: {
      'portfolio-grid': {
        name: 'portfolio-grid',
        width: 400,
        height: 600,
        url: 'https://img/grid.jpg',
      },
      'scaled-medium': {
        name: 'scaled-medium',
        width: 500,
        height: 750,
        url: 'https://img/medium.jpg',
      },
      // Shop's square crop: no longer used by portfolio images.
      'listing-card': {
        name: 'listing-card',
        width: 400,
        height: 400,
        url: 'https://img/card.jpg',
      },
    },
  },
};

const gridImage = () => screen.getByAltText('Summer collection');

const openPreview = async () => {
  await act(async () => {
    fireEvent.click(gridImage());
  });
  return document.querySelector('.ant-image-preview-img');
};

describe('ImageCard, masonry (the Portfolio default)', () => {
  it('loads the 400 px grid image only when it nears the screen, with its height kept free', () => {
    render(<ImageCard item={item} gridLayout={GRID_STYLE_MASONRY} />);
    expect(gridImage()).toHaveAttribute('src', 'https://img/grid.jpg');
    expect(gridImage()).toHaveAttribute('loading', 'lazy');
    // Unsized, a lazy image is 0 px tall, so every one counts as on screen and loads at once.
    expect(gridImage().style.aspectRatio).toBe('400 / 600');
  });

  it('previews the 750 px image, loaded only when opened', async () => {
    render(<ImageCard item={item} gridLayout={GRID_STYLE_MASONRY} />);
    expect(document.querySelector('.ant-image-preview-img')).toBeNull();
    expect(await openPreview()).toHaveAttribute('src', 'https://img/medium.jpg');
  });
});

describe('ImageCard, square', () => {
  it('shows the same 400 px file as masonry, cropped to the square here', () => {
    render(<ImageCard item={item} gridLayout={GRID_STYLE_SQUARE} />);
    expect(gridImage()).toHaveAttribute('src', 'https://img/grid.jpg');
    expect(gridImage()).toHaveAttribute('loading', 'lazy');
    expect(gridImage().style.objectFit).toBe('cover');
    expect(gridImage().style.height).toBe('100%');
  });

  it('previews the 750 px image', async () => {
    render(<ImageCard item={item} gridLayout={GRID_STYLE_SQUARE} />);
    expect(await openPreview()).toHaveAttribute('src', 'https://img/medium.jpg');
  });
});
