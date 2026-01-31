# MoltBot on Azure Container Apps
# This Dockerfile builds MoltBot from source with Azure-specific configurations
# Based on https://docs.molt.bot/platforms/gcp

# Use official MoltBot image
FROM moltbot/moltbot:latest

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Set environment variables for Azure
ENV NODE_ENV=production
ENV GATEWAY_PORT=18789
ENV GATEWAY_BIND=0.0.0.0
ENV HOME=/home/node
ENV XDG_CONFIG_HOME=/home/node/.moltbot
ENV TERM=xterm-256color

# Use our entrypoint script
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["gateway", "--bind", "lan", "--port", "18789"]

# Expose the Gateway port
EXPOSE 18789