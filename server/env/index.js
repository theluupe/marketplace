/**
   Implements .env file loading that mimicks the way create-react-app
   does it. We want this to get consistent configuration handling
   between client and node server.
*/

const fs = require('fs');

const { loadSecrets } = require('./secretManager');

const NODE_ENV = process.env.NODE_ENV;
if (!NODE_ENV) {
  throw new Error('The NODE_ENV environment variable is required but was not specified.');
}

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
var dotenvFiles = [
  `.env.${NODE_ENV}.local`,
  // Only include `.env.local` for `development` environment
  NODE_ENV === 'development' && `.env.local`,
  `.env.${NODE_ENV}`,
  '.env',
].filter(Boolean);

const configureEnv = async () => {
  console.warn('\nLoading environment variables..');
  // Load environment variables from .env* files. Suppress warnings using silent
  // if this file is missing. dotenv will never modify any environment variables
  // that have already been set.
  // https://github.com/motdotla/dotenv
  dotenvFiles.forEach(dotenvFile => {
    if (fs.existsSync(dotenvFile)) {
      console.log('Loading env from file:' + dotenvFile);
      require('dotenv-expand')(
        require('dotenv').config({
          path: dotenvFile,
        })
      );
    }
  });
  const secrets = await loadSecrets();
  require('dotenv-expand')({ parsed: secrets });
  console.warn('Loading environment variables DONE\n');
};

module.exports = {
  configureEnv: configureEnv,
};
