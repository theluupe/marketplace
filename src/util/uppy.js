import { createUploadSignature } from './api';

const MAX_FILE_SIZE_GB = 2; // Value in GB
const MAX_TOTAL_FILE_SIZE_GB = 2; // Value in GB
export const MAX_NUMBER_OF_FILES = 200;

export async function createUppyInstance(meta, onBeforeUpload) {
  try {
    // Dynamically import Uppy modules, so they don't break server bundle
    const { default: Uppy } = await import('@uppy/core');
    const { default: Transloadit } = await import('@uppy/transloadit');

    const uppy = new Uppy({
      onBeforeUpload,
      restrictions: {
        /**
         * [TODO:] Enable videos before release
         */
        // allowedFileTypes: ['image/*', 'video/*'],
        allowedFileTypes: ['image/*'],
        maxNumberOfFiles: MAX_NUMBER_OF_FILES,
        maxFileSize: MAX_FILE_SIZE_GB * 1024 * 1024 * 1024, // byte to GB
        maxTotalFileSize: MAX_TOTAL_FILE_SIZE_GB * 1024 * 1024 * 1024, // byte to GB
      },
    });

    uppy.use(Transloadit, {
      assemblyOptions: async file => {
        const { params, signature } = await createUploadSignature({ ...meta });
        return {
          service: process.env.REACT_APP_TRANSLOADIT_SERVICE_URL,
          params: JSON.parse(params),
          signature,
        };
      },
      waitForEncoding: true,
      waitForMetadata: true,
      limit: 5,
    });

    return uppy;
  } catch (error) {
    console.error('Failed to initialize Uppy with Redux middleware:', error);
    return null;
  }
}
