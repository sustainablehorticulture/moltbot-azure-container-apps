// Test LoRaWAN Control Functions
const https = require('https');

// Configuration
const LORAWAN_FUNCTION_URL = 'https://agricultural-lorawan-control.azurewebsites.net';
const FUNCTION_KEY = 'your-function-key-here'; // Get from Azure Portal
const SITE_ID = 'farm-a'; // Your site identifier
const DEVICE_ID = 'LT2222-FA-001'; // Your device ID

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'agricultural-lorawan-control.azurewebsites.net',
            path: `/api${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-functions-key': FUNCTION_KEY
            }
        };

        if (body) {
            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
        }

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: jsonData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

// Test Functions
async function testLoRaWANFunctions() {
    console.log('🧪 Testing LoRaWAN Control Functions\n');

    try {
        // Test 1: Get all devices
        console.log('1️⃣ Testing: Get all devices');
        const devices = await makeRequest(`/sites/${SITE_ID}/devices`);
        console.log('Status:', devices.statusCode);
        console.log('Response:', devices.body);
        console.log('');

        // Test 2: Get specific device status
        console.log('2️⃣ Testing: Get device status');
        const deviceStatus = await makeRequest(`/sites/${SITE_ID}/status/${DEVICE_ID}`);
        console.log('Status:', deviceStatus.statusCode);
        console.log('Response:', deviceStatus.body);
        console.log('');

        // Test 3: Get relay status
        console.log('3️⃣ Testing: Get relay status');
        const relayStatus = await makeRequest(`/sites/${SITE_ID}/relays/${DEVICE_ID}`);
        console.log('Status:', relayStatus.statusCode);
        console.log('Response:', relayStatus.body);
        console.log('');

        // Test 4: Control relay (turn ON)
        console.log('4️⃣ Testing: Control relay ON');
        const relayOn = await makeRequest(`/sites/${SITE_ID}/relays/${DEVICE_ID}`, 'POST', {
            relayId: 1,
            state: true
        });
        console.log('Status:', relayOn.statusCode);
        console.log('Response:', relayOn.body);
        console.log('');

        // Test 5: Control digital I/O
        console.log('5️⃣ Testing: Control digital I/O');
        const digitalIO = await makeRequest(`/sites/${SITE_ID}/digital/${DEVICE_ID}`, 'POST', {
            pinId: 3,
            state: false,
            mode: 'output'
        });
        console.log('Status:', digitalIO.statusCode);
        console.log('Response:', digitalIO.body);
        console.log('');

        // Test 6: Batch operations
        console.log('6️⃣ Testing: Batch operations');
        const batchOps = await makeRequest(`/sites/${SITE_ID}/batch`, 'POST', {
            operations: [
                {
                    type: 'relay',
                    deviceId: DEVICE_ID,
                    relayId: 1,
                    state: false
                },
                {
                    type: 'digital',
                    deviceId: DEVICE_ID,
                    pinId: 4,
                    state: true,
                    mode: 'output'
                }
            ]
        });
        console.log('Status:', batchOps.statusCode);
        console.log('Response:', batchOps.body);
        console.log('');

        // Test 7: Get schedules
        console.log('7️⃣ Testing: Get schedules');
        const schedules = await makeRequest(`/sites/${SITE_ID}/schedules`);
        console.log('Status:', schedules.statusCode);
        console.log('Response:', schedules.body);
        console.log('');

        console.log('✅ All tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Test with mock data (for local testing without Azure)
function testWithMockData() {
    console.log('🧪 Testing with Mock Data\n');

    // Mock responses
    const mockResponses = {
        devices: {
            siteId: 'farm-a',
            devices: [
                {
                    deviceId: 'LT2222-FA-001',
                    name: 'Greenhouse Controller A1',
                    type: 'LT2222',
                    enabled: true,
                    online: true
                }
            ]
        },
        relayStatus: {
            deviceId: 'LT2222-FA-001',
            siteId: 'farm-a',
            relays: {
                relay1: false,
                relay2: false
            }
        },
        relayControl: {
            success: true,
            deviceId: 'LT2222-FA-001',
            siteId: 'farm-a',
            relayId: 1,
            state: true,
            timestamp: new Date().toISOString()
        }
    };

    console.log('1️⃣ Mock: Get all devices');
    console.log(JSON.stringify(mockResponses.devices, null, 2));
    console.log('');

    console.log('2️⃣ Mock: Get relay status');
    console.log(JSON.stringify(mockResponses.relayStatus, null, 2));
    console.log('');

    console.log('3️⃣ Mock: Control relay ON');
    console.log(JSON.stringify(mockResponses.relayControl, null, 2));
    console.log('');

    console.log('✅ Mock tests completed!');
}

// Run tests
if (require.main === module) {
    // Check if we have Azure credentials
    if (process.env.FUNCTION_KEY) {
        console.log('🚀 Running Azure Tests...\n');
        testLoRaWANFunctions();
    } else {
        console.log('🧪 Running Mock Tests (Set FUNCTION_KEY to test against Azure)\n');
        testWithMockData();
    }
}

module.exports = {
    testLoRaWANFunctions,
    testWithMockData,
    makeRequest
};
