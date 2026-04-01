import _ from 'lodash';
import { createSelector } from 'reselect';
import { createSlice } from '@reduxjs/toolkit';

import { fetchCurrentUser } from '../../ducks/user.duck';
import { generateImageKeywords } from '../../util/api';
import { readFileMetadataAsync } from '../../util/file-metadata';
import { createUppyInstance } from '../../util/uppy';
import {
  convertMoneyToNumber,
  convertUnitToSubUnit,
  truncateToSubUnitPrecision,
  unitDivisor,
} from '../../util/currency';
import { LISTING_TYPES } from '../../util/types';
import { parse } from '../../util/urlHelpers';
import { RESULT_PAGE_SIZE } from '../ManageListingsPage/ManageListingsPage.duck';
import { storableError } from '../../util/errors';
import { types as sdkTypes } from '../../util/sdkLoader';
import {
  AI_TERMS_STATUS_ACCEPTED,
  AI_TERMS_STATUS_NOT_REQUIRED,
  AI_TERMS_STATUS_REQUIRED,
  DEFAULT_PRODUCT_LISTING_PRICE,
  MAX_KEYWORDS,
  NO_RELEASES,
  PAGE_MODE_NEW,
  YES_RELEASES,
  WIZARD_TABS,
} from './constants';
import { getImageSize } from './imageHelpers';
import { stringToArray, deduplicateKeywords } from '../../util/string';

const { UUID, Money } = sdkTypes;
const BILLIARD = 1000000000000000;
const { TAGGING, PRODUCT_DETAILS } = WIZARD_TABS;

function getListingFieldOptions(config, listingFieldKey) {
  const { listing } = config;
  const { listingFields } = listing;
  const { enumOptions } = listingFields.find(f => f.key === listingFieldKey);
  return enumOptions.map(({ label, option }) => ({ value: option, label }));
}

function listingsFromSdkResponse(sdkResponse, listingDefaults) {
  const { data, included } = sdkResponse;
  const { currency } = listingDefaults;
  return data.map(ownListing => {
    const images = ownListing.relationships.images;
    const image =
      images.data.length > 0 ? included.find(img => img.id.uuid === images.data[0].id.uuid) : null;
    const preview = image?.attributes?.variants?.default?.url;
    const keywordsRaw = stringToArray(ownListing.attributes.publicData.keywords, ' ');
    const keywords = deduplicateKeywords(keywordsRaw);
    const category = stringToArray(ownListing.attributes.publicData.imageryCategory);
    const price = convertMoneyToNumber(ownListing.attributes.price || new Money(0, currency));
    const releases = ownListing.attributes.publicData.releases;

    return {
      id: ownListing.id.uuid,
      name: ownListing.attributes.publicData.originalFileName,
      title: ownListing.attributes.title,
      description: ownListing.attributes.description,
      keywords,
      category,
      usage: ownListing.attributes.publicData.usage,
      releases: releases === YES_RELEASES ? true : releases === NO_RELEASES ? false : releases,
      dimensions: ownListing.attributes.publicData.dimensions,
      imageSize: ownListing.attributes.publicData.imageSize,
      price,
      isIllustration: ownListing.attributes.publicData.categoryLevel1 === 'illustrations',
      preview,
    };
  });
}

function uppyFileToListing(file) {
  const { id, meta, name, size, preview, type } = file;
  const { keywords, height, width } = meta;
  const dimensions = `${width}px × ${height}px`;
  const imageSize = getImageSize(width, height);
  const keywordsOptions = deduplicateKeywords(keywords || []).slice(0, MAX_KEYWORDS);
  return {
    key: id,
    id,
    name,
    description: null,
    keywords: keywordsOptions,
    size,
    preview,
    category: [],
    usage: null,
    releases: false,
    price: DEFAULT_PRODUCT_LISTING_PRICE,
    dimensions: dimensions,
    imageSize: imageSize,
    isAi: false,
    isIllustration: false,
    type,
  };
}

function validateListingPropertiesHandler(tab = PRODUCT_DETAILS) {
  const requiredProperties = [
    'title',
    'description',
    'keywords',
    ...(tab === PRODUCT_DETAILS ? ['category', 'usage', 'price'] : []),
  ];
  return listing => {
    const missingProperties = requiredProperties.filter(
      property =>
        !listing[property] || (Array.isArray(listing[property]) && !listing[property].length)
    );
    return missingProperties.length ? { listing, missingProperties } : null;
  };
}

/** Table rows store price as a number; currency truncation expects a major-unit string. */
function listingPriceToTruncatableString(price) {
  if (price == null || (typeof price === 'number' && Number.isNaN(price))) {
    return '0';
  }
  return String(price);
}

function getListingCategory(listing) {
  if (listing.isIllustration) return 'illustrations';
  return 'photos';
}

function areAllThumbnailsReady(listings) {
  return listings.length > 0 && listings.every(l => !!l.preview);
}

function areAllKeywordsReady(listings) {
  return listings.length > 0 && listings.every(l => !!l.tagsReady);
}

const initialState = {
  listings: [],
  uppy: null,
  listingFieldsOptions: {
    categories: [],
    usages: [],
  },
  invalidListings: [],
  selectedRowsKeys: [],
  aiTermsStatus: AI_TERMS_STATUS_NOT_REQUIRED,
  saveListingsInProgress: false,
  createListingsSuccess: null,
  userId: null,
  failedListings: [],
  successfulListings: [],
  listingCategory: null,
  queryParams: [],
  queryInProgress: false,
  queryListingsError: null,
  listingDefaults: {
    currency: 'USD',
    transactionType: {
      process: 'default-purchase',
      alias: 'default-purchase/release-1',
      unitType: 'item',
    },
  },
  csvUploadInProgress: false,
  csvUploadError: null,
  setStockInProgress: false,
  setStockError: null,
  allThumbnailsReady: false,
  allKeywordsReady: false,
  isProcessingTags: false,
};

const batchEditListingPageSlice = createSlice({
  name: 'BatchEditListingPage',
  initialState,
  reducers: {
    setUserId: (state, action) => {
      state.userId = action.payload;
    },
    setListingsDefaults: (state, action) => {
      state.listingDefaults = action.payload;
    },
    receiveUppyInit: (state, action) => {
      const { uppy, files } = action.payload;
      state.uppy = uppy;
      state.listings = files;
      state.allThumbnailsReady = areAllThumbnailsReady(files);
      state.allKeywordsReady = areAllKeywordsReady(files);
    },
    addFile: (state, action) => {
      const payload = action.payload;
      const newListings = [...state.listings, payload];
      state.listings = newListings;
      state.selectedRowsKeys = _.uniq([...state.selectedRowsKeys, payload.id]);
      state.allThumbnailsReady = areAllThumbnailsReady(newListings);
      state.allKeywordsReady = areAllKeywordsReady(newListings);
    },
    removeFile: (state, action) => {
      const newListings = state.listings.filter(file => file.id !== action.payload.id);
      state.listings = newListings;
      state.selectedRowsKeys = state.selectedRowsKeys.filter(key => key !== action.payload.id);
      state.allThumbnailsReady = areAllThumbnailsReady(newListings);
      state.allKeywordsReady = areAllKeywordsReady(newListings);
    },
    removeManyFiles: (state, action) => {
      const newListings = action.payload;
      state.listings = newListings;
      state.allThumbnailsReady = areAllThumbnailsReady(newListings);
      state.allKeywordsReady = areAllKeywordsReady(newListings);
    },
    resetFiles: state => {
      state.listings = [];
      state.selectedRowsKeys = [];
      state.allThumbnailsReady = false;
      state.allKeywordsReady = false;
    },
    updateListingRow: (state, action) => {
      const { id, ...values } = action.payload;
      state.listings = state.listings.map(listing =>
        listing.id === id ? { ...listing, ...values } : listing
      );
    },
    previewGenerated: (state, action) => {
      const { id, preview } = action.payload;
      const newListings = state.listings.map(listing =>
        listing.id === id
          ? {
              ...listing,
              preview,
            }
          : listing
      );
      state.listings = newListings;
      state.allThumbnailsReady = areAllThumbnailsReady(newListings);
      state.allKeywordsReady = areAllKeywordsReady(newListings);
    },
    keywordsGenerated: (state, action) => {
      const { id, keywords, title, description } = action.payload;
      const newListings = state.listings.map(listing =>
        listing.id === id
          ? {
              ...listing,
              tagsReady: true,
              title,
              description,
              keywords,
            }
          : listing
      );
      state.listings = newListings;
      state.allThumbnailsReady = areAllThumbnailsReady(newListings);
      state.allKeywordsReady = areAllKeywordsReady(newListings);
    },
    fetchListingOptions: (state, action) => {
      const { categories, usages, releases } = action.payload;
      state.listingFieldsOptions = {
        categories,
        usages,
        releases,
      };
    },
    setInvalidListings: (state, action) => {
      state.invalidListings = action.payload;
    },
    setAiTermsAccepted: state => {
      state.aiTermsStatus = AI_TERMS_STATUS_ACCEPTED;
    },
    setAiTermsRequired: state => {
      state.aiTermsStatus = AI_TERMS_STATUS_REQUIRED;
    },
    setAiTermsNotRequired: state => {
      state.aiTermsStatus = AI_TERMS_STATUS_NOT_REQUIRED;
    },
    setSelectedRows: (state, action) => {
      state.selectedRowsKeys = action.payload;
    },
    saveListingsRequest: state => {
      state.saveListingsInProgress = true;
    },
    saveListingsError: state => {
      state.createListingsSuccess = false;
      state.saveListingsInProgress = false;
    },
    saveListingsAborted: state => {
      state.createListingsSuccess = null;
      state.saveListingsInProgress = false;
      state.invalidListings = [];
    },
    saveListingsSuccess: state => {
      state.createListingsSuccess = true;
      state.saveListingsInProgress = false;
    },
    addFailedListing: (state, action) => {
      state.failedListings.push(action.payload);
    },
    addSuccessfulListing: (state, action) => {
      state.successfulListings.push(action.payload);
    },
    resetState: () => initialState,
    fetchListingsForEditRequest: {
      prepare: queryParams => ({ payload: { queryParams } }),
      reducer: (state, action) => {
        state.queryParams = action.payload.queryParams;
        state.queryInProgress = true;
        state.queryListingsError = null;
      },
    },
    fetchListingsForEditSuccess: (state, action) => {
      state.queryInProgress = false;
      state.queryListingsError = null;
      state.listings = listingsFromSdkResponse(action.payload.data, state.listingDefaults);
    },
    fetchListingsForEditError: (state, action) => {
      state.queryInProgress = false;
      state.queryListingsError = action.payload;
    },
    csvUploadRequest: state => {
      state.csvUploadInProgress = true;
      state.csvUploadError = null;
    },
    csvUploadSuccess: state => {
      state.csvUploadInProgress = false;
      state.csvUploadError = null;
    },
    csvUploadError: (state, action) => {
      state.csvUploadInProgress = false;
      state.csvUploadError = action.payload;
    },
    setStockRequest: state => {
      state.setStockInProgress = true;
      state.setStockError = null;
    },
    setStockSuccess: state => {
      state.setStockInProgress = false;
    },
    setStockError: (state, action) => {
      state.setStockInProgress = false;
      state.setStockError = action.payload;
    },
    setProcessingTagsQueueStart: state => {
      state.isProcessingTags = true;
    },
    setProcessingTagsQueueEnd: state => {
      state.isProcessingTags = false;
    },
  },
});

export const {
  setUserId,
  setListingsDefaults,
  addFile,
  removeFile,
  removeManyFiles,
  resetFiles,
  updateListingRow,
  previewGenerated,
  keywordsGenerated,
  fetchListingOptions,
  setInvalidListings,
  setAiTermsAccepted,
  setAiTermsRequired,
  setAiTermsNotRequired,
  setSelectedRows,
  saveListingsRequest,
  saveListingsError,
  saveListingsAborted,
  saveListingsSuccess,
  addFailedListing,
  addSuccessfulListing,
  resetState,
  fetchListingsForEditRequest,
  fetchListingsForEditSuccess,
  fetchListingsForEditError,
  csvUploadRequest,
  csvUploadSuccess,
  csvUploadError,
  setStockRequest,
  setStockSuccess,
  setStockError,
  setProcessingTagsQueueStart,
  setProcessingTagsQueueEnd,
} = batchEditListingPageSlice.actions;

export default batchEditListingPageSlice.reducer;

// ============== Selector =============== //
export const getUppyInstance = state => state.BatchEditListingPage.uppy;
export const getListings = state => state.BatchEditListingPage.listings;
export const getSingleListing = (state, id) =>
  state.BatchEditListingPage.listings.find(l => l.id === id);
export const getInvalidListings = state => state.BatchEditListingPage.invalidListings;
export const getListingFieldsOptions = state => state.BatchEditListingPage.listingFieldsOptions;
export const getSelectedRowsKeys = state => state.BatchEditListingPage.selectedRowsKeys;

export const getListingCreationInProgress = state =>
  state.BatchEditListingPage.saveListingsInProgress;
export const getAiTermsRequired = state =>
  state.BatchEditListingPage.aiTermsStatus === AI_TERMS_STATUS_REQUIRED;
export const getAiTermsAccepted = state =>
  state.BatchEditListingPage.aiTermsStatus === AI_TERMS_STATUS_ACCEPTED;

export const getCreateListingsSuccess = state => state.BatchEditListingPage.createListingsSuccess;
export const getFailedListings = state => state.BatchEditListingPage.failedListings;

const getSuccessfulListings = state => state.BatchEditListingPage.successfulListings;
const getSaveListingsInProgress = state => state.BatchEditListingPage.saveListingsInProgress;

export const getSaveListingData = createSelector(
  getFailedListings,
  getSuccessfulListings,
  getSelectedRowsKeys,
  getSaveListingsInProgress,
  (failedListings, successfulListings, selectedRowsKeys, saveListingsInProgress) => ({
    failedListings,
    successfulListings,
    selectedRowsKeys,
    saveListingsInProgress,
  })
);
export const getListingsDefaults = state => state.BatchEditListingPage.listingDefaults;
export const getIsQueryInProgress = state => state.BatchEditListingPage.queryInProgress;
export const getAllThumbnailsReady = state => state.BatchEditListingPage.allThumbnailsReady;
export const getAllKeywordsReady = state => state.BatchEditListingPage.allKeywordsReady;
export const getIsProcessingTags = state => state.BatchEditListingPage.isProcessingTags;
export const getListingsDetails = state => state.BatchEditListingPage.listings;
export const getKeywordsGenerationProgress = createSelector(getListingsDetails, listings => {
  const total = listings.length;
  const completed = listings.filter(l => l.tagsReady).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
});

function updateAiTermsStatus(getState, dispatch) {
  if (getAiTermsAccepted(getState())) {
    return;
  }
  const listings = getListings(getState());
  const hasAi = listings.some(listing => listing.isAi);
  dispatch(hasAi ? setAiTermsRequired() : setAiTermsNotRequired());
}

function getOnBeforeUpload(getState) {
  return files => {
    const selectedFilesIds = getSelectedRowsKeys(getState());

    return selectedFilesIds.reduce((acc, key) => {
      if (key in files) {
        acc[key] = files[key];
      }
      return acc;
    }, {});
  };
}

// ================ Thunk ================ //

const PHOTOTAG_RATE_LIMIT_DELAY_MS = 1200;
const PHOTOTAG_ERROR_DELAY_MS = 1000;
const MAX_RETRIES = 5;
let PROCESSING_TAGS_QUEUE = [];

async function processKeywordQueue(dispatch, getState) {
  const isProcessingTags = getIsProcessingTags(getState());
  const allThumbnailsReady = getAllThumbnailsReady(getState());
  if (!allThumbnailsReady || isProcessingTags || PROCESSING_TAGS_QUEUE.length === 0) {
    return;
  }
  dispatch(setProcessingTagsQueueStart());
  const inFlightPromises = [];
  while (PROCESSING_TAGS_QUEUE.length > 0) {
    const job = PROCESSING_TAGS_QUEUE.shift();
    const promise = job.execute();
    inFlightPromises.push(promise);
    if (PROCESSING_TAGS_QUEUE.length > 0) {
      await new Promise(resolve => setTimeout(resolve, PHOTOTAG_RATE_LIMIT_DELAY_MS));
    }
  }
  await Promise.allSettled(inFlightPromises);
  dispatch(setProcessingTagsQueueEnd());
}

function addToKeywordQueue(job, dispatch, getState) {
  PROCESSING_TAGS_QUEUE.push(job);
  const isProcessingTags = getIsProcessingTags(getState());
  if (!isProcessingTags) {
    processKeywordQueue(dispatch, getState);
  }
}

function clearKeywordQueue(dispatch) {
  PROCESSING_TAGS_QUEUE = [];
  dispatch(setProcessingTagsQueueEnd());
}

function compareAndSetStock(listingId) {
  return (dispatch, getState, sdk) => {
    dispatch(setStockRequest());
    return sdk.stock
      .compareAndSet({ listingId, oldTotal: null, newTotal: BILLIARD }, { expand: true })
      .then(() => {
        dispatch(setStockSuccess());
      })
      .catch(e => {
        console.error(`Failed updating stock for listingId: ${listingId}`, e);
        dispatch(setStockError(storableError(e)));
        throw e;
      });
  };
}

export function initializeUppy(meta) {
  return (dispatch, getState, sdk) => {
    createUppyInstance(meta, getOnBeforeUpload(getState)).then(uppyInstance => {
      dispatch(
        batchEditListingPageSlice.actions.receiveUppyInit({
          uppy: uppyInstance,
          files: uppyInstance.getFiles().map(uppyFileToListing),
        })
      );

      uppyInstance.on('file-removed', file => {
        dispatch(removeFile(file));
        updateAiTermsStatus(getState, dispatch);
      });

      uppyInstance.on('file-added', file => {
        const { id } = file;
        const uppy = getUppyInstance(getState());
        const newFile = uppy.getFile(id);
        const listing = uppyFileToListing(newFile);
        dispatch(addFile(listing));
        updateAiTermsStatus(getState, dispatch);
        readFileMetadataAsync(file).then(metadata => {
          if (metadata.thumbnail) {
            const { thumbnail, ...otherMetadata } = metadata;
            uppy.setFileState(id, {
              preview: thumbnail,
            });
            uppy.setFileMeta(id, otherMetadata);
          } else {
            uppy.setFileMeta(id, metadata);
          }
          const newFileWithMetadata = uppy.getFile(id);
          const listingWithMetadata = uppyFileToListing(newFileWithMetadata);
          dispatch(updateListingRow(listingWithMetadata));
        });
      });

      uppyInstance.on('cancel-all', () => {
        clearKeywordQueue(dispatch);
        dispatch(resetFiles());
      });

      uppyInstance.on('thumbnail:generated', (file, preview) => {
        const { id, name, type } = file;
        const listing = getSingleListing(getState(), id);
        if (!listing.preview) {
          dispatch(previewGenerated({ id, preview }));
          addToKeywordQueue(
            {
              listingId: id,
              execute: async () => {
                let keywords = [];
                let title = '';
                let description = '';
                try {
                  const previewFile = await fetch(preview);
                  const blob = await previewFile.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  const base64 = btoa(
                    new Uint8Array(arrayBuffer).reduce(
                      (data, byte) => data + String.fromCharCode(byte),
                      ''
                    )
                  );
                  let retries = 0;
                  let fileProceced = false;
                  while (!fileProceced && retries < MAX_RETRIES) {
                    try {
                      const generatedTags = await generateImageKeywords({
                        file: {
                          data: base64,
                          filename: name || 'image.jpg',
                          contentType: type || 'image/jpeg',
                        },
                      });
                      const originalKeywords = deduplicateKeywords(listing?.keywords || []);
                      const generatedKeywords = deduplicateKeywords(generatedTags?.keywords || []);
                      keywords = deduplicateKeywords([...originalKeywords, ...generatedKeywords]);
                      title = generatedTags?.title || '';
                      description = generatedTags?.description || '';
                      fileProceced = true;
                    } catch (error) {
                      const errMessage = error?.message || '';
                      const errStatus = error?.response?.status || '';
                      const errStatusText = error?.response?.statusText || '';
                      const isRateLimitError =
                        errStatus === 429 ||
                        errStatusText.toLowerCase().includes('too many requests') ||
                        errMessage.toLowerCase().includes('too many requests');
                      if (isRateLimitError && retries < MAX_RETRIES - 1) {
                        retries++;
                        console.warn(
                          `PhotoTag | Rate limit hit for listing ${id}. Retrying (${retries}/${MAX_RETRIES})...`
                        );
                        await new Promise(resolve => setTimeout(resolve, PHOTOTAG_ERROR_DELAY_MS));
                      } else {
                        fileProceced = true;
                        throw error;
                      }
                    }
                  }
                } catch (error) {
                  console.error('Keyword generation failed for listing: ', id, error);
                } finally {
                  dispatch(keywordsGenerated({ id, keywords, title, description }));
                }
              },
            },
            dispatch,
            getState
          );
        }
      });

      uppyInstance.on('transloadit:result', (assembly, result) => {
        const { localId, ssl_url } = result;
        const isOriginal = assembly === ':original';
        const fileData = {
          ...(isOriginal ? { originalUrl: ssl_url } : { previewUrl: ssl_url }),
        };
        dispatch(updateListingRow({ id: localId, ...fileData }));
      });

      uppyInstance.on('complete', async result => {
        const listingsDefaults = getListingsDefaults(getState());
        if (result.failed?.length) {
          result.failed.forEach(failed => {
            const failedListing = getSingleListing(getState(), failed.id);
            dispatch(addFailedListing(failedListing));
          });
        }
        for (let successfulUpload of result.successful) {
          const listing = getSingleListing(getState(), successfulUpload.id);
          try {
            const { currency, transactionType } = listingsDefaults;
            const truncatedPrice = truncateToSubUnitPrecision(
              listingPriceToTruncatableString(listing.price),
              unitDivisor(currency)
            );
            const price = convertUnitToSubUnit(truncatedPrice, unitDivisor(currency));
            const { previewUrl, originalUrl } = listing;
            const withTempAssets = !!previewUrl && !!originalUrl;
            if (withTempAssets) {
              const listingData = {
                title: listing.title,
                description: listing.description,
                publicData: {
                  listingType: LISTING_TYPES.PRODUCT,
                  categoryLevel1: getListingCategory(listing),
                  imageryCategory: listing.category,
                  usage: listing.usage,
                  releases: listing.releases ? YES_RELEASES : NO_RELEASES,
                  keywords: (listing.keywords || []).join(' '),
                  dimensions: listing.dimensions,
                  imageSize: listing.imageSize,
                  fileType: listing.type,
                  originalFileName: listing.name,
                  transactionProcessAlias: transactionType.alias,
                  unitType: transactionType.unitType,
                },
                privateData: {
                  tempPreviewAssetUrl: listing.previewUrl,
                  tempOriginalAssetUrl: listing.originalUrl,
                },
                price: {
                  amount: price,
                  currency: currency,
                },
              };
              const sdkListing = await sdk.ownListings.create(listingData, {
                expand: true,
              });
              const listingId = sdkListing.data.data.id;
              await dispatch(compareAndSetStock(listingId));
              dispatch(addSuccessfulListing(listing));
            } else {
              dispatch(addFailedListing(listing));
            }
          } catch (error) {
            dispatch(addFailedListing(listing));
            console.error('Error during image upload:', error);
          }
        }
        const { successfulListings, failedListings, selectedRowsKeys } = getSaveListingData(
          getState()
        );
        const totalListingsProcessed = successfulListings.length + failedListings.length;
        if (totalListingsProcessed === selectedRowsKeys.length) {
          dispatch(failedListings.length > 0 ? saveListingsError() : saveListingsSuccess());
        }
      });

      uppyInstance.on('error', error => {
        if (error.assembly) {
          console.error(`Assembly ID ${error.assembly.assembly_id} failed!`);
        }
      });
    });
  };
}

export const requestUpdateListing = payload => dispatch => {
  dispatch(updateListingRow(payload));
};

export function requestSaveTags(onSuccess) {
  return (dispatch, getState) => {
    const selectedListingsIds = getSelectedRowsKeys(getState());
    const originalListings = getListings(getState());
    const listings = originalListings.filter(listing => selectedListingsIds.includes(listing.id));
    const validateListingProperties = validateListingPropertiesHandler(TAGGING);
    const invalidListings = listings
      .map(validateListingProperties)
      .filter(result => result !== null);
    if (invalidListings.length > 0) {
      dispatch(setInvalidListings(invalidListings.map(f => f.listing.name)));
      return;
    }
    dispatch(removeManyFiles(listings));
    if (onSuccess) {
      onSuccess();
    }
  };
}

export function requestSaveBatchListings(pageMode = PAGE_MODE_NEW) {
  return (dispatch, getState, sdk) => {
    dispatch(saveListingsRequest());

    const selectedListingsIds = getSelectedRowsKeys(getState());
    const listings = getListings(getState()).filter(listing =>
      selectedListingsIds.includes(listing.id)
    );

    const validateListingProperties = validateListingPropertiesHandler();
    const invalidListings = listings
      .map(validateListingProperties)
      .filter(result => result !== null);

    if (invalidListings.length > 0) {
      dispatch(setInvalidListings(invalidListings.map(f => f.listing.name)));
      return;
    }

    const aiListings = listings.filter(listing => listing.isAi);
    const aiTermsAccepted = getAiTermsAccepted(getState());
    if (aiListings.length > 0 && !aiTermsAccepted) {
      dispatch(setAiTermsRequired());
      return;
    }

    if (pageMode === PAGE_MODE_NEW) {
      const uppy = getUppyInstance(getState());
      uppy.upload();
    } else {
      const listingsDefaults = getListingsDefaults(getState());
      const { currency } = listingsDefaults;

      const listingPromises = listings.map(listing => {
        return new Promise((resolve, reject) => {
          const truncatedPrice = truncateToSubUnitPrecision(
            listingPriceToTruncatableString(listing.price),
            unitDivisor(currency)
          );
          const price = convertUnitToSubUnit(truncatedPrice, unitDivisor(currency));
          const id = new UUID(listing.id);
          sdk.ownListings
            .update(
              {
                id,
                title: listing.title,
                description: listing.description,
                publicData: {
                  categoryLevel1: getListingCategory(listing),
                  imageryCategory: listing.category,
                  usage: listing.usage,
                  releases: listing.releases ? YES_RELEASES : NO_RELEASES,
                  keywords: listing.keywords.join(' '),
                  dimensions: listing.dimensions,
                  imageSize: listing.imageSize,
                },
                price: {
                  amount: price,
                  currency: currency,
                },
              },
              {
                expand: true,
              }
            )
            .then(() => {
              dispatch(addSuccessfulListing(listing));
              resolve();
            })
            .catch(ex => {
              console.error('Failed saving listing', ex);
              dispatch(addFailedListing(listing));
              reject();
            });
        });
      });

      Promise.all(listingPromises)
        .then(() => dispatch(saveListingsSuccess()))
        .catch(() => dispatch(saveListingsError()));
    }
  };
}

export const queryOwnListings = queryParams => (dispatch, getState, sdk) => {
  dispatch(fetchListingsForEditRequest(queryParams));

  const { perPage, pub_listingId, ...rest } = queryParams;
  const validListingType = !!queryParams.pub_listingType;
  const validCategoryType = !!queryParams.pub_categoryLevel1;
  const validRequestParams = validListingType || validCategoryType;
  const params = { ...rest, perPage };

  if (!validRequestParams) return;

  return sdk.ownListings
    .query(params)
    .then(response => {
      dispatch(fetchListingsForEditSuccess(response));
      const listings = getListings(getState());
      dispatch(setSelectedRows(_.uniq(listings.map(ownListing => ownListing.id))));
      return response;
    })
    .catch(e => {
      dispatch(fetchListingsForEditError(storableError(e)));
      throw e;
    });
};

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const { transactionType } = config.listing.listingTypes.find(
    ({ listingType }) => listingType === LISTING_TYPES.PRODUCT
  );
  dispatch(
    setListingsDefaults({
      currency: config.currency,
      transactionType,
    })
  );

  const { mode } = params;
  if (mode !== PAGE_MODE_NEW) {
    const queryParams = parse(search);
    const page = queryParams.page || 1;
    dispatch(
      queryOwnListings({
        ...queryParams,
        page,
        perPage: RESULT_PAGE_SIZE,
        include: ['images'],
        'fields.image': ['variants.default'],
        'limit.images': 1,
      })
    );
  }

  const imageryCategoryOptions = getListingFieldOptions(config, 'imageryCategory');
  const usageOptions = getListingFieldOptions(config, 'usage');

  dispatch(
    fetchListingOptions({
      categories: imageryCategoryOptions,
      usages: usageOptions,
    })
  );

  const fetchCurrentUserOptions = {
    updateNotifications: false,
  };
  return dispatch(fetchCurrentUser(fetchCurrentUserOptions))
    .then(response => {
      dispatch(setUserId(response.id));
      return response;
    })
    .catch(e => {
      throw e;
    });
};
