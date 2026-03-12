# LoRaWAN Testing Commands

## 🧪 Quick cURL Tests

Replace `YOUR_FUNCTION_KEY` with your actual Azure Function key.

### 1. Get All Devices
```bash
curl -X GET "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/devices" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY"
```

### 2. Get Device Status
```bash
curl -X GET "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/status/LT2222-FA-001" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY"
```

### 3. Get Relay Status
```bash
curl -X GET "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY"
```

### 4. Control Relay (Turn ON)
```bash
curl -X POST "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{
    "relayId": 1,
    "state": true
  }'
```

### 5. Control Relay (Turn OFF)
```bash
curl -X POST "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{
    "relayId": 1,
    "state": false
  }'
```

### 6. Control Digital I/O
```bash
curl -X POST "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/digital/LT2222-FA-001" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{
    "pinId": 3,
    "state": true,
    "mode": "output"
  }'
```

### 7. Batch Operations
```bash
curl -X POST "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/batch" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY" \
  -d '{
    "operations": [
      {
        "type": "relay",
        "deviceId": "LT2222-FA-001",
        "relayId": 1,
        "state": true
      },
      {
        "type": "digital",
        "deviceId": "LT2222-FA-001",
        "pinId": 4,
        "state": false,
        "mode": "output"
      }
    ]
  }'
```

### 8. Get Schedules
```bash
curl -X GET "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/schedules" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_FUNCTION_KEY"
```

## 🧪 PowerShell Tests

### Get Devices
```powershell
$headers = @{
    "Content-Type" = "application/json"
    "x-functions-key" = "YOUR_FUNCTION_KEY"
}

Invoke-RestMethod -Uri "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/devices" -Method Get -Headers $headers
```

### Control Relay
```powershell
$body = @{
    relayId = 1
    state = $true
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-functions-key" = "YOUR_FUNCTION_KEY"
}

Invoke-RestMethod -Uri "https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001" -Method Post -Headers $headers -Body $body
```

## 🔧 Node.js Test

Run the test file:
```bash
# Mock test (no Azure needed)
node test-lorawan.js

# Azure test (requires FUNCTION_KEY environment variable)
FUNCTION_KEY=your-key node test-lorawan.js
```

## 🌐 Browser Test

1. Open `lorawan-test-page.html` in your browser
2. Enter your Function App URL and Function Key
3. Test all the functions using the buttons

## 📱 Postman/Insomnia

Import this collection:

### Get Devices
- **Method**: GET
- **URL**: `https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/devices`
- **Headers**: 
  - `Content-Type`: `application/json`
  - `x-functions-key`: `YOUR_FUNCTION_KEY`

### Control Relay
- **Method**: POST
- **URL**: `https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001`
- **Headers**: 
  - `Content-Type`: `application/json`
  - `x-functions-key`: `YOUR_FUNCTION_KEY`
- **Body**:
```json
{
    "relayId": 1,
    "state": true
}
```

## ✅ Expected Responses

### Success Response (200)
```json
{
    "success": true,
    "deviceId": "LT2222-FA-001",
    "siteId": "farm-a",
    "relayId": 1,
    "state": true,
    "timestamp": "2026-03-10T04:00:00.000Z"
}
```

### Error Response (401/404/500)
```json
{
    "error": "Unauthorized",
    "message": "Function key is invalid"
}
```

## 🎯 Test Checklist

- [ ] Get all devices
- [ ] Get device status
- [ ] Get relay status
- [ ] Turn relay ON
- [ ] Turn relay OFF
- [ ] Control digital I/O
- [ ] Run batch operations
- [ ] Get schedules
- [ ] Test with different site IDs
- [ ] Test with invalid device IDs
