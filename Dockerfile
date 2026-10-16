FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY resources/package.json ./resources/package.json
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:stable-alpine

ENV NEOS_RESOURCE_URL=http://resources:8788 NGINX_ENVSUBST_FILTER=^NEOS_RESOURCE_URL$
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80
