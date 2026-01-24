FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy default config (will be overridden by volume mount)
COPY nginx.conf /etc/nginx/nginx.conf
