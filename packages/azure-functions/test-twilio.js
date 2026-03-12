// Test Twilio SMS Integration
const https = require('https');

// Configuration
const ALERT_FUNCTION_URL = 'https://backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net';
const ALERT_FUNCTION_KEY = 'your-alert-function-key-here';
const SITE_ID = 'grassgumfarm';

// Test SMS sending
function testTwilioSMS() {
    return new Promise((resolve, reject) => {
        const testData = {
            type: 'sms',
            recipients: [
                { phone: '+1234567890' } // Replace with your phone number
            ],
            message: '🚨 Test Alert: High temperature detected in greenhouse A1. Current: 42°C. Please check cooling system.'
        };

        const options = {
            hostname: 'backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net',
            path: '/api/alerts/send',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-functions-key': ALERT_FUNCTION_KEY,
                'x-site-id': SITE_ID
            }
        };

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
                        body: jsonData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(testData));
        req.end();
    });
}

// Test alert processing (should trigger SMS)
function testAlertProcessing() {
    return new Promise((resolve, reject) => {
        const alertData = {
            sensorId: 'IR1OT',
            value: 42, // High temperature to trigger alert
            deviceId: 'BD-BZD'
        };

        const options = {
            hostname: 'backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net',
            path: '/api/alerts/process',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-functions-key': ALERT_FUNCTION_KEY,
                'x-site-id': SITE_ID
            }
        };

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
                        body: jsonData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        body: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(alertData));
        req.end();
    });
}

// Run tests
async function runTwilioTests() {
    console.log('📱 Testing Twilio SMS Integration\n');

    try {
        // Test 1: Direct SMS sending
        console.log('1️⃣ Testing: Direct SMS sending');
        const smsResult = await testTwilioSMS();
        console.log('Status:', smsResult.statusCode);
        console.log('Response:', JSON.stringify(smsResult.body, null, 2));
        console.log('');

        // Test 2: Alert processing (should trigger SMS)
        console.log('2️⃣ Testing: Alert processing (should trigger SMS)');
        const alertResult = await testAlertProcessing();
        console.log('Status:', alertResult.statusCode);
        console.log('Response:', JSON.stringify(alertResult.body, null, 2));
        console.log('');

        console.log('✅ Twilio tests completed!');
        console.log('');
        console.log('Check your phone for SMS messages!');
        console.log('Check Twilio console for delivery status: https://console.twilio.com/');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Mock test (without Azure)
function testWithMockData() {
    console.log('📱 Testing Twilio with Mock Data\n');

    const mockSMSResponse = {
        success: true,
        siteId: 'grassgumfarm',
        type: 'sms',
        sent: 1,
        failed: 0,
        results: [
            {
                success: true,
                provider: 'twilio',
                messageId: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                to: '+1234567890',
                from: '+1234567890',
                status: 'sent'
            }
        ]
    };

    const mockAlertResponse = {
        success: true,
        siteId: 'grassgumfarm',
        alertId: 'alert-uuid-generated-id',
        alertType: 'high_temperature',
        severity: 'warning',
        message: 'High temperature alert: 42°C (threshold: 35°C) for sensor IR1OT',
        shouldNotify: true,
        notificationsSent: 1,
        timestamp: new Date().toISOString()
    };

    console.log('1️⃣ Mock: Direct SMS sending');
    console.log(JSON.stringify(mockSMSResponse, null, 2));
    console.log('');

    console.log('2️⃣ Mock: Alert processing with SMS notification');
    console.log(JSON.stringify(mockAlertResponse, null, 2));
    console.log('');

    console.log('✅ Mock tests completed!');
    console.log('Replace "your-alert-function-key-here" with actual function key to test real SMS.');
}

// Run tests
if (require.main === module) {
    // Check if we have function key
    if (process.env.ALERT_FUNCTION_KEY) {
        console.log('🚀 Running real Twilio tests...\n');
        runTwilioTests();
    } else {
        console.log('🧪 Running mock tests (Set ALERT_FUNCTION_KEY to test real SMS)\n');
        testWithMockData();
    }
}

module.exports = {
    testTwilioSMS,
    testAlertProcessing,
    runTwilioTests,
    testWithMockData
};
