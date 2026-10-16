# Build the dashboard, then serve it (and proxy the backends) with nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty bases = same origin: nginx proxies /api, /auth and /ai.
ARG VITE_API_BASE=""
ARG VITE_AI_BASE="/ai"
ARG VITE_DEMO_LOGIN="true"
ENV VITE_API_BASE=$VITE_API_BASE VITE_AI_BASE=$VITE_AI_BASE VITE_DEMO_LOGIN=$VITE_DEMO_LOGIN
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
