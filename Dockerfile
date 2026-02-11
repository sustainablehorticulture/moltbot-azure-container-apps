# Red Dog - AI Farm Data Assistant
# Runs the Red Dog API server with Discord client and database integration

FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S reddog -u 1001 -G nodejs

# Change ownership
RUN chown -R reddog:nodejs /app
USER reddog

# Default port (matches Azure Container Apps config)
ENV GATEWAY_PORT=18789
EXPOSE 18789

# Health check against the API server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${GATEWAY_PORT}/health || exit 1

# Start Red Dog
CMD ["node", "src/reddog/index.js"]
