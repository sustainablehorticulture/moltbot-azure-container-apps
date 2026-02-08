# Red Dog on Azure Container Apps
# This Dockerfile builds Red Dog from source with Azure-specific configurations

# Based on https://docs.molt.bot/platforms/gcp

# Use OpenClaw source build which includes Discord channel support
FROM cr5eqmkn3bypkyu.azurecr.io/clawdbot:v6

# Copy config writer script
COPY write-config.cjs /app/write-config.cjs

# Set environment variables for Azure
ENV NODE_ENV=production
ENV GATEWAY_PORT=18789
ENV GATEWAY_BIND=0.0.0.0
ENV HOME=/home/node
ENV XDG_CONFIG_HOME=/home/node/.openclaw
ENV TERM=xterm-256color

# Write config, restore persistent data from Azure Files, then launch gateway
# Azure Files mounted at /mnt/openclaw-data (no chmod/symlink support)
# We copy persistent data in at startup and sync back via background job
COPY sync-data.sh /app/sync-data.sh

ENTRYPOINT ["sh", "-c", "\
  node /app/write-config.cjs && \
  node openclaw.mjs doctor --fix && \
  sh /app/sync-data.sh restore && \
  sh /app/sync-data.sh watch & \
  exec node openclaw.mjs gateway --bind lan --port 18789 --allow-unconfigured"]

# Expose the Gateway port
EXPOSE 18789