# Configure Twilio for Alert System

# Parameters
$resourceGroupName = "AgenticAG"
$functionAppName = "backendalerts-e9c2gdf3ejdzdgfp"

Write-Host "Configuring Twilio for Alert System..."
Write-Host "Function App: $functionAppName"
Write-Host "Resource Group: $resourceGroupName"
Write-Host ""

# Get Twilio credentials from user
$accountSid = Read-Host "Enter your Twilio Account SID (starts with AC)"
$authToken = Read-Host "Enter your Twilio Auth Token" -AsSecureString
$phoneNumber = Read-Host "Enter your Twilio Phone Number (format: +1234567890)"

# Convert secure string to plain text
$authTokenPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($authToken))

# Configure Azure Function App settings
Write-Host "Setting up Azure Function App configuration..."

az functionapp config appsettings set `
  --resource-group $resourceGroupName `
  --name $functionAppName `
  --settings `
  TWILIO_ACCOUNT_SID=$accountSid `
  TWILIO_AUTH_TOKEN=$authTokenPlain `
  TWILIO_PHONE_NUMBER=$phoneNumber `
  SMS_PROVIDER=twilio

Write-Host ""
Write-Host "✅ Twilio configuration completed!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Test SMS sending with your alert function"
Write-Host "2. Verify Twilio usage in your Twilio console"
Write-Host "3. Monitor Azure Function App logs"
Write-Host ""
Write-Host "Test command:"
Write-Host "curl -X POST 'https://backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net/api/alerts/send' -H 'Content-Type: application/json' -H 'x-functions-key: YOUR_KEY' -H 'x-site-id: grassgumfarm' -d '{\"type\":\"sms\",\"recipients\":[{\"phone\":\"+1234567890\"}],\"message\":\"Test alert from agricultural system\"}'"
