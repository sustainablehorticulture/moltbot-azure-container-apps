# MoltBot on Azure Container Apps
# This Dockerfile builds MoltBot from source with Azure-specific configurations
# Based on https://docs.molt.bot/platforms/gcp

FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    socat \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Optional: Install external binaries for skills (add as needed)
# Gmail CLI
# RUN curl -L https://github.com/steipete/gog/releases/latest/download/gog_Linux_x86_64.tar.gz \
#   | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/gog

# Google Places CLI
# RUN curl -L https://github.com/steipete/goplaces/releases/latest/download/goplaces_Linux_x86_64.tar.gz \
#   | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/goplaces

# WhatsApp CLI
# RUN curl -L https://github.com/steipete/wacli/releases/latest/download/wacli_Linux_x86_64.tar.gz \
#   | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/wacli

# Set working directory
WORKDIR /app

# Clone MoltBot repository
ARG MOLTBOT_VERSION=main
RUN git clone --depth 1 --branch ${MOLTBOT_VERSION} https://github.com/moltbot/moltbot.git .

# Enable corepack for pnpm
RUN corepack enable

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build MoltBot
RUN pnpm build

# Build UI
RUN pnpm ui:install
RUN pnpm ui:build

# Create persistent directories
RUN mkdir -p /home/node/.moltbot /home/node/molt

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV GATEWAY_PORT=18789
ENV GATEWAY_BIND=0.0.0.0
ENV HOME=/home/node
ENV XDG_CONFIG_HOME=/home/node/.moltbot
ENV TERM=xterm-256color
ENV PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:18789/health || exit 1

# Expose the Gateway port
EXPOSE 18789

# Start MoltBot Gateway via entrypoint (generates config from env vars)
ENTRYPOINT ["/app/entrypoint.sh"]