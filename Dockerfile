FROM node:24.13.0

ARG COMMIT_SHA
ENV BUILD_SHA ${COMMIT_SHA}

WORKDIR /usr/src/app

COPY . .

ENV BASIC_AUTH_USERNAME=theluupe-dev
ENV BASIC_AUTH_PASSWORD=TheLuupe_123

ENV NODE_ENV=production
ENV PORT=8080

# Since NODE_ENV=production is set above, `yarn install` would skip devDependencies
# by default. Post CRA-eject (upstream v11.0.0), all build tooling — webpack, babel,
# css-loader, postcss-loader, html-webpack-plugin, etc. — lives in devDependencies,
# so `yarn build` below would fail without them. Force-install everything.
RUN yarn install --production=false
RUN yarn build
# Node runs as the container's main process, not under `yarn start`: on SIGTERM yarn passes the signal on and then
# exits at once, and when the main process exits Cloud Run stops the container, so the graceful shutdown in
# server/index.js (stop taking requests, let running ones finish) never got to run.
CMD ["node", "server/index.js"]
