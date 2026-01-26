# ClawdBot Azure Container Apps - Post-Deploy Script
# This script runs after the application is deployed

param(
    [string]$ResourceGroup = $env:AZURE_RESOURCE_GROUP,
    [string]$ClawdbotAppName = $env:CLAWDBOT_APP_NAME,
    [string]$ClawdbotGatewayUrl = $env:CLAWDBOT_GATEWAY_URL
)

Write-Host "ClawdBot Post-Deploy Verification" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Wait for the Container App to be ready
Write-Host ""
Write-Host "Waiting for ClawdBot to start..." -ForegroundColor Yellow

$maxRetries = 30
$retryCount = 0
$isHealthy = $false

while ($retryCount -lt $maxRetries -and -not $isHealthy) {
    $retryCount++
    try {
        $response = Invoke-WebRequest -Uri "$ClawdbotGatewayUrl/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $isHealthy = $true
        }
    } catch {
        Write-Host "   Attempt $retryCount/$maxRetries - Waiting for Gateway..." -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }
}

if ($isHealthy) {
    Write-Host ""
    Write-Host "ClawdBot Gateway is healthy!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "WARNING: ClawdBot Gateway health check timed out" -ForegroundColor Yellow
    Write-Host "   The container may still be starting. Check logs with:" -ForegroundColor Gray
    Write-Host "   az containerapp logs show --name $ClawdbotAppName --resource-group $ResourceGroup --follow" -ForegroundColor Gray
}

Write-Host ""
Write-Host "ClawdBot Deployment Complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "Gateway URL: $ClawdbotGatewayUrl" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor White
Write-Host ""
Write-Host "   1. Invite your Discord bot to a server:" -ForegroundColor Gray
Write-Host "      https://discord.com/oauth2/authorize?client_id=<YOUR_BOT_CLIENT_ID>&permissions=274877991936&scope=bot%20applications.commands" -ForegroundColor Cyan
Write-Host ""
Write-Host "      (Get the Client ID from Discord Developer Portal -> Your App -> OAuth2)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   2. Message the bot via Discord DM:" -ForegroundColor Gray
Write-Host "      - Find the bot in your server's member list" -ForegroundColor DarkGray
Write-Host "      - Right-click -> Message" -ForegroundColor DarkGray
Write-Host "      - Send: Hello!" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   3. View logs if needed:" -ForegroundColor Gray
Write-Host "      az containerapp logs show --name $ClawdbotAppName --resource-group $ResourceGroup --follow" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "Important Notes:" -ForegroundColor White
Write-Host "   - Discord bots require a shared server before you can DM them" -ForegroundColor Gray
Write-Host "   - Only users in DISCORD_ALLOWED_USERS can DM the bot" -ForegroundColor Gray
Write-Host "   - Model must be exact: openrouter/anthropic/claude-3.5-sonnet" -ForegroundColor Gray
Write-Host "   - Estimated cost: ~\$40-60/month" -ForegroundColor Gray
Write-Host ""
Write-Host "Happy chatting with Clawd! 🦞" -ForegroundColor Cyan
