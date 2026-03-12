# Create LoRaWAN Function App

# Parameters
$resourceGroupName = "AgenticAG"
$location = "australiasoutheast"
$functionAppName = "backendlorawan-lorawancontrol"

# Generate unique ID for domain
$uniqueId = -join ('-', (1..8) | ForEach-Object { [char]::GetRandom('abcdefghijkmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') }) | ForEach-Object { $_ } }) | ForEach-Object { $_.ToUpper() })
$storageAccountName = "backendlorawan$($uniqueId.ToLower())"

Write-Host "Creating LoRaWAN Function App..."
Write-Host "Resource Group: $resourceGroupName"
Write-Host "Location: $location"
Write-Host "Function App: $functionAppName"
Write-Host "Storage Account: $storageAccountName"
Write-Host "Expected URL: https://backendlorawan-$uniqueId.australiasoutheast-01.azurewebsites.net"

# Create storage account first
Write-Host "Creating storage account..."
az storage account create `
  --name $storageAccountName `
  --resource-group $resourceGroupName `
  --location $location `
  --sku Standard_LRS

# Create Function App
Write-Host "Creating Function App..."
az functionapp create `
  --resource-group $resourceGroupName `
  --name $functionAppName `
  --storage-account $storageAccountName `
  --consumption-plan-location $location `
  --runtime node `
  --runtime-version 22 `
  --functions-version 4

Write-Host "✅ LoRaWAN Function App created successfully!"
Write-Host "Function App URL: https://backendlorawan-$uniqueId.australiasoutheast-01.azurewebsites.net"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update GitHub Actions workflow with new Function App name"
Write-Host "2. Configure LoRaWAN environment variables"
Write-Host "3. Deploy LoRaWAN functions"
Write-Host "4. Test with your function key"
