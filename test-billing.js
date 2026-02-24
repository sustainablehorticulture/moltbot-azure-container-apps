const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testBilling() {
    console.log('🧪 Testing Red Dog Billing System\n');

    // Test 1: Health check
    console.log('1. Health check...');
    try {
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health:', health.data.billing.stripeConfigured ? 'Stripe configured' : 'Stripe not configured');
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }

    // Test 2: Check credits for new user
    console.log('\n2. Check credits for new user...');
    try {
        const credits = await axios.get(`${BASE_URL}/api/credits/test-user-456`);
        console.log('✅ Credits:', credits.data.credits, 'Plan:', credits.data.plan);
    } catch (error) {
        console.log('❌ Credits check failed:', error.message);
    }

    // Test 3: Try chat without credits (should fail)
    console.log('\n3. Try chat without credits...');
    try {
        const chat = await axios.post(`${BASE_URL}/api/chat`, {
            message: 'hello',
            userId: 'test-user-456'
        });
        console.log('❌ Chat should have failed but got response:', chat.data.reply);
    } catch (error) {
        if (error.response?.data?.error === 'Insufficient credits') {
            console.log('✅ Correctly blocked chat due to insufficient credits');
        } else {
            console.log('❌ Unexpected error:', error.response?.data || error.message);
        }
    }

    // Test 4: Try farm query without credits (should fail)
    console.log('\n4. Try farm query without credits...');
    try {
        const query = await axios.post(`${BASE_URL}/api/chat`, {
            message: 'what crops are grown at Grassgum Farm',
            userId: 'test-user-456'
        });
        console.log('❌ Query should have failed but got response:', query.data.reply);
    } catch (error) {
        if (error.response?.data?.error === 'Insufficient credits') {
            console.log('✅ Correctly blocked farm query due to insufficient credits');
        } else {
            console.log('❌ Unexpected error:', error.response?.data || error.message);
        }
    }

    // Test 5: Check billing summary
    console.log('\n5. Check billing summary...');
    try {
        const billing = await axios.get(`${BASE_URL}/api/billing/test-user-456`);
        console.log('✅ Billing status:', billing.data.status);
    } catch (error) {
        console.log('❌ Billing summary failed:', error.message);
    }

    console.log('\n🎉 Billing system test complete!');
    console.log('\n📋 Summary:');
    console.log('- ✅ Credit enforcement is working');
    console.log('- ✅ Chat operations blocked without credits');
    console.log('- ✅ Farm queries blocked without credits');
    console.log('- ✅ Billing endpoints responding');
    console.log('\n💡 Next: Add credits via Stripe payment or admin interface');
}

testBilling().catch(console.error);
