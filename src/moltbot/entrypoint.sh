#!/bin/bash
# Red Dog Azure Container Apps Entrypoint
# Generates configuration from environment variables and starts the gateway

set -e

CONFIG_DIR="${HOME}/.reddog"
CONFIG_FILE="${CONFIG_DIR}/reddog.json"

# Create config directory
mkdir -p "${CONFIG_DIR}"

# Build Discord config section if token is provided
DISCORD_CONFIG=""
if [ -n "${DISCORD_BOT_TOKEN}" ]; then
  # Parse comma-separated Discord user IDs into JSON array format
  if [ -n "${DISCORD_ALLOWED_USERS}" ]; then
    # Convert "id1,id2,id3" to ["id1","id2","id3"]
    DISCORD_USERS_JSON=$(echo "${DISCORD_ALLOWED_USERS}" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')
    DISCORD_DM_CONFIG='"dm": {
        "enabled": true,
        "policy": "allowlist",
        "allowFrom": '"${DISCORD_USERS_JSON}"'
      }'
    echo "Discord channel configured: yes (DM allowlist: ${DISCORD_ALLOWED_USERS})"
  else
    # No allowlist - disable DMs for security
    DISCORD_DM_CONFIG='"dm": {
        "enabled": false
      }'
    echo "Discord channel configured: yes (DMs disabled - set DISCORD_ALLOWED_USERS to enable)"
  fi
  DISCORD_CONFIG='"discord": {
      "enabled": true,
      '"${DISCORD_DM_CONFIG}"',
      "groupPolicy": "open"
    }'
else
  echo "Discord channel configured: no (DISCORD_BOT_TOKEN not set)"
fi

# Build channels section
CHANNELS_SECTION=""
if [ -n "${DISCORD_CONFIG}" ]; then
  CHANNELS_SECTION='"channels": {
    '"${DISCORD_CONFIG}"'
  },'
fi

# Generate Red Dog configuration using current schema format
cat > "${CONFIG_FILE}" << EOF
{
  "agents": {
    "defaults": {
      "workspace": "${HOME}/reddog",
      "model": {
        "primary": "${MOLTBOT_MODEL:-openrouter/anthropic/claude-3.5-sonnet}"
      }
    },
    "list": [
      {
        "id": "main",
        "identity": {
          "name": "${MOLTBOT_PERSONA_NAME:-Red Dog}",
          "theme": "helpful assistant",
          "emoji": "🐕"
        }
      }
    ]
  },
  ${CHANNELS_SECTION}
  "gateway": {
    "port": ${GATEWAY_PORT:-18789},
    "bind": "lan",
    "controlUi": {
      "enabled": true
    },
    "auth": {
      "mode": "token",
      "token": "${MOLTBOT_GATEWAY_TOKEN}"
    }
  },
  "database": {
    "enabled": $([ -n "${DATABASE_CONNECTION_STRING}" ] && echo 'true' || echo 'false'),
    "type": "${DATABASE_TYPE:-mssql}",
    "connectionString": "${DATABASE_CONNECTION_STRING}",
    "queryTimeout": 30000
  },
  "logging": {
    "level": "info",
    "consoleLevel": "info",
    "consoleStyle": "pretty"
  }
}
EOF

echo "Red Dog configuration written to ${CONFIG_FILE}"
echo "Gateway token configured: $([ -n "${MOLTBOT_GATEWAY_TOKEN}" ] && echo 'yes' || echo 'no')"

# Disable TypeScript native compiler to avoid runtime compilation issues
export TS_NATIVE=false

# Start Red Dog gateway directly from built files
cd /app
exec node dist/index.js gateway --bind lan --port "${GATEWAY_PORT:-18789}" --allow-unconfigured "$@"