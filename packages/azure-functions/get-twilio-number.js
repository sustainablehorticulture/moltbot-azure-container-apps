// Twilio Phone Number Setup Guide
console.log('📱 Twilio Phone Number Setup Guide\n');

console.log('🎯 Step 1: Sign Up');
console.log('1. Go to https://www.twilio.com/try-twilio');
console.log('2. Click "Sign up" and create account');
console.log('3. Verify email and phone number');
console.log('');

console.log('🎯 Step 2: Choose Phone Number');
console.log('Option A: Free Trial Number (Recommended)');
console.log('- After signup, click "Get your first Twilio phone number"');
console.log('- Look for numbers with SMS capability (✅ SMS checkbox)');
console.log('- Click "Choose this number"');
console.log('');

console.log('Option B: Buy Specific Number');
console.log('- Go to https://console.twilio.com/');
console.log('- Phone Numbers → Buy a Number');
console.log('- Set Country: Your country');
console.log('- Capabilities: Check SMS only');
console.log('- Click "Search" and choose a number');
console.log('');

console.log('🎯 Step 3: Verify Your Number');
console.log('Your number should look like: +1234567890');
console.log('Must have SMS capability enabled');
console.log('');

console.log('🎯 Step 4: Test Your Number');
console.log('1. Go to https://console.twilio.com/');
console.log('2. Phone Numbers → Active Numbers');
console.log('3. Click on your number');
console.log('4. Click "Try it out" → "Send a message"');
console.log('5. Enter your personal phone number');
console.log('6. Type test message and send');
console.log('');

console.log('🎯 Step 5: Get Credentials');
console.log('From https://console.twilio.com/ dashboard:');
console.log('- Account SID (starts with AC)');
console.log('- Auth Token (click "Show" to reveal)');
console.log('- Your Twilio phone number');
console.log('');

console.log('🎯 Step 6: Configure Azure');
console.log('Run: powershell -ExecutionPolicy Bypass -File configure-twilio.ps1');
console.log('Enter your credentials when prompted');
console.log('');

console.log('✅ Your Twilio number is ready for SMS alerts!');
console.log('📱 You can now receive agricultural alerts on your phone!');
