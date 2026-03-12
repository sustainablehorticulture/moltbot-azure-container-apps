// Test Twilio directly (without Azure Functions)
const https = require('https');
require('dotenv').config();

// Twilio API test
function testTwilioDirect() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const toNumber = process.env.TEST_PHONE_NUMBER; // Set in .env
    
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const postData = `To=${encodeURIComponent(toNumber)}&From=${encodeURIComponent(fromNumber)}&Body=${encodeURIComponent('🚨 Test Alert: Agricultural system is working! High temperature detected in greenhouse A1. Current: 42°C. Please check cooling system immediately.')}`;
    
    const options = {
        hostname: 'api.twilio.com',
        path: '/2010-04-01/Accounts/' + accountSid + '/Messages.json',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': 'Basic ' + auth
        }
    };
    
    const req = https.request(options, (res) => {
        console.log('Status:', res.statusCode);
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('Response:', jsonData);
                
                if (jsonData.sid) {
                    console.log('✅ SMS sent successfully!');
                    console.log('Message SID:', jsonData.sid);
                    console.log('Status:', jsonData.status);
                    console.log('To:', jsonData.to);
                    console.log('From:', jsonData.from);
                } else {
                    console.log('❌ SMS failed');
                    console.log('Error:', jsonData.message);
                }
            } catch (error) {
                console.log('Raw Response:', data);
            }
        });
    });
    
    req.on('error', (error) => {
        console.error('Error:', error.message);
    });
    
    req.write(postData);
    req.end();
}

console.log('📱 Testing Twilio SMS directly...\n');
testTwilioDirect();
