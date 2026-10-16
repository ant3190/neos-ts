FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY resources/package.json ./resources/package.json
RUN npm ci --omit=dev --workspace=@neos/resource-service --include-workspace-root=false --ignore-scripts
COPY resources ./resources
ENV NEOS_RESOURCE_DIR=/data NEOS_RESOURCE_PORT=8788 NODE_USE_ENV_PROXY=1
EXPOSE 8788
CMD ["node", "resources/server.mjs"]
