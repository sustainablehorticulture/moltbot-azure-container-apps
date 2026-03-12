# Create LoRaWAN Function App with consistent domain pattern

# Parameters
$resourceGroupName = "AgenticAG"
$location = "australiasoutheast"
$functionAppName = "backendlorawan-lorawancontrol"

# Generate unique ID for domain
$uniqueId = (Get-Random -Length 8).Replace('-', '').ToUpper()
$storageAccountName = "backendlorawan$($uniqueId.ToLower())"

Write-Host "Creating LoRaWAN Function App..."
Write-Host "Resource Group: $resourceGroupName"
Write-Host "Location: $location"
Write-Host "Function App: $functionAppName"
Write-Host "Storage Account: $storageAccountName"
Write-Host "Expected URL: https://backendlorawan-$uniqueId.australiasoutheast-01.azurewebsites.net"

# Create Function App
az functionapp create `
  --resource-group $resourceGroupName `
  --name $functionAppName `
  --storage-account $storageAccountName `
  --consumption-plan-location $location `
  --runtime node `
  --runtime-version 22 `
  --functions-version 4

Write-Host "✅ LoRaWAN Function App created successfully!"
Write-Host "Expected URL: https://backendlorawan-$uniqueId.australiasoutheast-01.azurewebsites.net"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update your GitHub Actions workflow with the new Function App name"
Write-Host "2. Configure environment variables in Azure Portal"
Write-Write-Host "3. Deploy your LoRaWAN functions"
Write-Write-Host "4. Test with the function key"
