#!/bin/bash
# ClawdBot Azure Container Apps - Post-Deploy Script
# This script runs after the application is deployed

set -e

echo "ClawdBot Post-Deploy Verification"
echo "===================================="

# Wait for the Container App to be ready
echo ""
echo "Waiting for ClawdBot to start..."

MAX_RETRIES=30
RETRY_COUNT=0
IS_HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$IS_HEALTHY" = "false" ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CLAWDBOT_GATEWAY_URL/health" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        IS_HEALTHY=true
    else
        echo "   Attempt $RETRY_COUNT/$MAX_RETRIES - Waiting for Gateway..."
        sleep 10
    fi
done

if [ "$IS_HEALTHY" = "true" ]; then
    echo ""
    echo "ClawdBot Gateway is healthy!"
else
    echo ""
    echo "WARNING: ClawdBot Gateway health check timed out"
    echo "   The container may still be starting. Check logs with:"
    echo "   az containerapp logs show --name $CLAWDBOT_APP_NAME --resource-group $AZURE_RESOURCE_GROUP --follow"
fi

echo ""
echo "ClawdBot Deployment Complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Gateway URL: $CLAWDBOT_GATEWAY_URL"
echo ""
echo "Next Steps:"
echo ""
echo "   1. Invite your Discord bot to a server:"
echo "      https://discord.com/oauth2/authorize?client_id=<YOUR_BOT_CLIENT_ID>&permissions=274877991936&scope=bot%20applications.commands"
echo ""
echo "      (Get the Client ID from Discord Developer Portal -> Your App -> OAuth2)"
echo ""
echo "   2. Message the bot via Discord DM:"
echo "      - Find the bot in your server's member list"
echo "      - Right-click -> Message"
echo "      - Send: Hello!"
echo ""
echo "   3. View logs if needed:"
echo "      az containerapp logs show --name $CLAWDBOT_APP_NAME --resource-group $AZURE_RESOURCE_GROUP --follow"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Important Notes:"
echo "   - Discord bots require a shared server before you can DM them"
echo "   - Only users in DISCORD_ALLOWED_USERS can DM the bot"
echo "   - Model must be exact: openrouter/anthropic/claude-3.5-sonnet"
echo "   - Estimated cost: ~\$40-60/month"
echo ""
echo "Happy chatting with Clawd! 🦞"
