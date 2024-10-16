# syntax=docker/dockerfile:experimental

FROM node:18.20.1

# install ssh client and git
RUN apt-get update -y && apt-get install -y git openssh-client gcc g++ make

# download public key for github.com
RUN mkdir -p -m 0600 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts

ARG COMMIT_SHA
ENV BUILD_SHA ${COMMIT_SHA}

WORKDIR /usr/src/app

COPY . .

ENV PORT=8080
ENV NODE_ENV=production

RUN --mount=type=ssh yarn install
RUN yarn build
CMD ["yarn", "start"]
