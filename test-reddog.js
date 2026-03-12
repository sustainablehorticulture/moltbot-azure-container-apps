#!/usr/bin/env node
/**
 * Red Dog Feature Test Script
 *
 * Usage:
 *   1. Start Red Dog:   node src/reddog/index.js
 *   2. Run tests:       node test-reddog.js [suite]
 *
 * Suites:  health | chat | db | sensors | devices | billing | all
 * Default: health + chat + db
 *
 * Examples:
 *   node test-reddog.js
 *   node test-reddog.js sensors
 *   node test-reddog.js all
 */

require('dotenv').config();
const axios = require('axios');

const BASE = `http://localhost:${process.env.API_PORT || 3001}`;
const FARM = process.env.FARM_ID || 'Grassgum Farm';
const suite = process.argv[2] || 'basic';

let passed = 0;
let failed = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function title(name) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  ${name}`);
    console.log('─'.repeat(55));
}

async function test(label, fn) {
    process.stdout.write(`  ${label.padEnd(48)}`);
    try {
        const result = await fn();
        console.log(`✓  ${result ?? ''}`);
        passed++;
    } catch (err) {
        const msg = err.response?.data?.error || err.message;
        console.log(`✗  ${msg}`);
        failed++;
    }
}

async function get(path, params = {}, timeout = 15000) {
    const res = await axios.get(`${BASE}${path}`, { params, timeout });
    return res.data;
}

async function post(path, body = {}, timeout = 15000) {
    const res = await axios.post(`${BASE}${path}`, body, { timeout });
    return res.data;
}

// ── Test Suites ────────────────────────────────────────────────────────────

async function testHealth() {
    title('Health');
    await test('GET /health', async () => {
        const d = await get('/health');
        return `status=${d.status} db=${d.database} dbs=[${(d.databases||[]).join(', ')}]`;
    });
}

async function testChat() {
    title('Chat');
    // Billing requires an account to exist before chat
    await post('/api/billing/account', { userOid: 'test-user', userEmail: 'test@reddog.local', userName: 'Test', plan: 'starter' }).catch(() => {});
    await test('POST /api/chat — simple greeting', async () => {
        const d = await post('/api/chat', { message: 'hello', userId: 'test-user' }, 30000);
        return `action=${d.action} reply="${(d.reply||'').slice(0,60)}..."`;
    });
    await test('POST /api/chat — DB query intent', async () => {
        const d = await post('/api/chat', { message: 'how many farms are in the database?', userId: 'test-user' }, 30000);
        return `action=${d.action}`;
    });
    await test('POST /api/chat — sensor intent', async () => {
        const d = await post('/api/chat', { message: `what is the live battery level at ${FARM}?`, userId: 'test-user' }, 30000);
        return `action=${d.action}`;
    });
    await test('POST /api/chat — device intent', async () => {
        const d = await post('/api/chat', { message: 'list all lorawan devices', userId: 'test-user' }, 30000);
        return `action=${d.action}`;
    });
    await test('POST /api/chat — missing message → 400', async () => {
        try {
            await post('/api/chat', {});
            throw new Error('Expected 400');
        } catch (e) {
            if (e.response?.status === 400) return '400 correctly returned';
            throw e;
        }
    });
}

async function testDatabase() {
    title('Database');
    await test('GET /api/databases', async () => {
        const d = await get('/api/databases');
        const names = (d.databases||[]).map(x => typeof x === 'string' ? x : x.name || JSON.stringify(x));
        return `dbs=[${names.join(', ')}]`;
    });
    await test('GET /api/schema', async () => {
        const d = await get('/api/schema');
        const names = (d.databases||[]).map(x => typeof x === 'string' ? x : x.name || JSON.stringify(x));
        return `databases=[${names.join(', ')}]`;
    });
    await test('GET /api/tables', async () => {
        const d = await get('/api/tables');
        return `${d.tables?.length ?? 0} tables in ${d.database}`;
    });
    await test('GET /api/tables/zerosumag', async () => {
        const d = await get('/api/tables/zerosumag');
        return `${d.tables?.length ?? 0} tables`;
    });
    await test('POST /api/query — SELECT from Site Overview', async () => {
        const d = await post('/api/query', { sql: 'SELECT TOP 3 * FROM [Site Overview]', database: 'zerosumag' });
        return `${d.rowCount} rows`;
    });
    await test('POST /api/query — SELECT from IoT_Infrastructure', async () => {
        const d = await post('/api/query', { sql: 'SELECT TOP 10 * FROM [dbo].[IoT_Infrastructure]', database: 'zerosumag' });
        return `${d.rowCount} rows`;
    });
    await test('POST /api/query — blocked mutation → 403', async () => {
        try {
            await post('/api/query', { sql: 'DELETE FROM [Site Overview]' });
            throw new Error('Expected 403');
        } catch (e) {
            if (e.response?.status === 403) return '403 correctly blocked';
            throw e;
        }
    });
}

async function testSensors() {
    title(`Sensors  (farm: "${FARM}")`);
    await test('GET /api/sensors/farms', async () => {
        const d = await get('/api/sensors/farms');
        return `${d.farms?.length ?? 0} farms`;
    });
    await test(`GET /api/sensors/${encodeURIComponent(FARM)}/vault`, async () => {
        const d = await get(`/api/sensors/${encodeURIComponent(FARM)}/vault`);
        return `keyVault=${d.keyVaultName}`;
    });
    await test(`GET /api/sensors/${encodeURIComponent(FARM)}/latest (all providers)`, async () => {
        const d = await get(`/api/sensors/${encodeURIComponent(FARM)}/latest`);
        return `provider=${d.provider} ts=${d.timestamp}`;
    });
    await test(`GET /api/sensors/${encodeURIComponent(FARM)}/latest?provider=selectronic`, async () => {
        const d = await get(`/api/sensors/${encodeURIComponent(FARM)}/latest`, { provider: 'selectronic' });
        return `ts=${d.timestamp}`;
    });
    await test(`GET /api/sensors/${encodeURIComponent(FARM)}/history?provider=selectronic&hours=24`, async () => {
        const d = await get(`/api/sensors/${encodeURIComponent(FARM)}/history`, { provider: 'selectronic', hours: 24 });
        return `hours=${d.hours}`;
    });
    await test('GET /api/sensors/all/latest', async () => {
        const d = await get('/api/sensors/all/latest');
        return `${d.farms?.length ?? 0} farms`;
    });
}

async function testDevices() {
    title('Devices');
    await test('GET /api/devices/lorawan', async () => {
        const d = await get('/api/devices/lorawan');
        return `${Array.isArray(d) ? d.length : JSON.stringify(d).slice(0, 60)} devices`;
    });
    // WattWatchers — uses siteId from env or default
    const ww = process.env.WATTWATCHERS_DEVICE_IDS?.split(',')[0] || 'D000000';
    await test(`GET /api/devices/wattwatchers/${ww}/energy`, async () => {
        const d = await get(`/api/devices/wattwatchers/${ww}/energy`);
        return JSON.stringify(d).slice(0, 80);
    });
}

async function testBilling() {
    title('Billing');
    const uid = 'test-user-billing';
    await test('POST /api/billing/account — create test account', async () => {
        const d = await post('/api/billing/account', { userOid: uid, userEmail: 'test@reddog.local', userName: 'Test User', plan: 'free' });
        return `created=${!!d}`;
    });
    await test('GET /api/billing/:userOid', async () => {
        const d = await get(`/api/billing/${uid}`);
        return `plan=${d.plan ?? d.subscription?.plan ?? 'unknown'}`;
    });
    await test('GET /api/credits/:userOid', async () => {
        const d = await get(`/api/credits/${uid}`);
        return `credits=${d.credits ?? d.balance ?? JSON.stringify(d).slice(0, 40)}`;
    });
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function run() {
    console.log(`\n🐕  Red Dog Test Suite`);
    console.log(`    Base URL : ${BASE}`);
    console.log(`    Farm     : ${FARM}`);
    console.log(`    Suite    : ${suite}`);

    const all = suite === 'all';

    try {
        await testHealth();

        if (all || suite === 'basic' || suite === 'chat') await testChat();
        if (all || suite === 'basic' || suite === 'db')   await testDatabase();
        if (all || suite === 'sensors')                   await testSensors();
        if (all || suite === 'devices')                   await testDevices();
        if (all || suite === 'billing')                   await testBilling();

    } catch (err) {
        console.error('\nFatal error:', err.message);
        console.error('Is Red Dog running?  node src/reddog/index.js');
    }

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Results:  ✓ ${passed} passed   ✗ ${failed} failed`);
    console.log('═'.repeat(55));
    process.exit(failed > 0 ? 1 : 0);
}

run();
