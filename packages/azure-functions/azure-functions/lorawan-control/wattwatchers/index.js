const { app } = require('@azure/functions');
const wattwatchersService = require('../services/wattwatchersService');

// Wattwatchers device control with privacy isolation
app.http('wattwatchers', {
    methods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'],
    authLevel: 'function',
    route: 'wattwatchers/{siteId}/{action}/{deviceId?}',
    handler: async (request, context) => {
        context.log('Wattwatchers function triggered');

        try {
            const method = request.method.toLowerCase();
            const { siteId, action, deviceId } = request.params;

            if (!siteId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Site ID is required in the route'
                    }
                };
            }

            context.log(`Wattwatchers request for site: ${siteId}, action: ${action}, device: ${deviceId || 'all'}`);

            switch (action) {
                case 'devices':
                    return await handleDevices(request, context, siteId, deviceId, method);

                case 'switches':
                    return await handleSwitches(request, context, siteId, deviceId, method);

                case 'config':
                    return await handleSwitchConfig(request, context, siteId, deviceId, method);

                case 'energy':
                    return await handleEnergy(request, context, siteId, deviceId, method);

                case 'energy-latest':
                    return await handleEnergyLatest(request, context, siteId, deviceId, method);

                default:
                    return {
                        status: 404,
                        jsonBody: {
                            error: 'Not Found',
                            message: `Unknown action: ${action}. Available: devices, switches, config, energy, energy-latest`
                        }
                    };
            }

        } catch (error) {
            context.log.error('Error in Wattwatchers function:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message
                }
            };
        }
    }
});

// ── Device Management ──────────────────────────────────────────────────

async function handleDevices(request, context, siteId, deviceId, method) {
    if (method !== 'get') {
        return { status: 405, jsonBody: { error: 'Method Not Allowed', message: 'Only GET is supported for devices' } };
    }

    if (deviceId) {
        const result = await wattwatchersService.getDevice(deviceId, siteId);
        return { status: 200, jsonBody: result };
    } else {
        const result = await wattwatchersService.listDevices(siteId);
        return { status: 200, jsonBody: result };
    }
}

// ── Switch Control ─────────────────────────────────────────────────────

async function handleSwitches(request, context, siteId, deviceId, method) {
    if (!deviceId) {
        return {
            status: 400,
            jsonBody: { error: 'Bad Request', message: 'deviceId is required for switch operations' }
        };
    }

    switch (method) {
        case 'get': {
            const result = await wattwatchersService.getSwitchStatus(deviceId, siteId);
            return { status: 200, jsonBody: result };
        }

        case 'post':
        case 'patch': {
            const body = await request.json();

            // Multiple switches: { switches: [{ switchId: "S1", state: "open" }] }
            if (body.switches && Array.isArray(body.switches)) {
                const result = await wattwatchersService.controlMultipleSwitches(deviceId, body.switches, siteId);
                return { status: 200, jsonBody: result };
            }

            // Single switch: { switchId: "S1", state: "open" }
            if (!body.switchId || !body.state) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Provide { switchId, state } for a single switch, or { switches: [{ switchId, state }] } for multiple. State must be "open" or "closed".'
                    }
                };
            }

            const result = await wattwatchersService.controlSwitch(deviceId, body.switchId, body.state, siteId);
            return { status: 200, jsonBody: result };
        }

        default:
            return { status: 405, jsonBody: { error: 'Method Not Allowed', message: 'Use GET to read switch status, POST/PATCH to control switches' } };
    }
}

// ── Switch Configuration ───────────────────────────────────────────────

async function handleSwitchConfig(request, context, siteId, deviceId, method) {
    if (!deviceId) {
        return {
            status: 400,
            jsonBody: { error: 'Bad Request', message: 'deviceId is required for switch configuration' }
        };
    }

    if (method !== 'post' && method !== 'patch') {
        return { status: 405, jsonBody: { error: 'Method Not Allowed', message: 'Use POST/PATCH to configure switches' } };
    }

    const body = await request.json();

    if (!body.switchId) {
        return {
            status: 400,
            jsonBody: { error: 'Bad Request', message: 'switchId is required' }
        };
    }

    // Configure contactor type
    if (body.contactorType) {
        const result = await wattwatchersService.configureSwitchContactor(deviceId, body.switchId, body.contactorType, siteId);
        return { status: 200, jsonBody: result };
    }

    // Configure labels
    if (body.label || body.closedStateLabel || body.openStateLabel) {
        const result = await wattwatchersService.configureSwitchLabels(deviceId, body.switchId, {
            label: body.label,
            closedStateLabel: body.closedStateLabel,
            openStateLabel: body.openStateLabel
        }, siteId);
        return { status: 200, jsonBody: result };
    }

    return {
        status: 400,
        jsonBody: {
            error: 'Bad Request',
            message: 'Provide contactorType ("NO" or "NC"), or label/closedStateLabel/openStateLabel to configure'
        }
    };
}

// ── Energy Data ────────────────────────────────────────────────────────

async function handleEnergy(request, context, siteId, deviceId, method) {
    if (method !== 'get') {
        return { status: 405, jsonBody: { error: 'Method Not Allowed', message: 'Only GET is supported for energy data' } };
    }

    if (!deviceId) {
        return { status: 400, jsonBody: { error: 'Bad Request', message: 'deviceId is required for energy data' } };
    }

    const url = new URL(request.url);
    const fromTs = url.searchParams.get('fromTs');
    const toTs = url.searchParams.get('toTs');
    const type = url.searchParams.get('type') || 'short';

    if (type === 'long') {
        const result = await wattwatchersService.getLongEnergy(deviceId, siteId, fromTs, toTs);
        return { status: 200, jsonBody: result };
    } else {
        const result = await wattwatchersService.getShortEnergy(deviceId, siteId, fromTs, toTs);
        return { status: 200, jsonBody: result };
    }
}

async function handleEnergyLatest(request, context, siteId, deviceId, method) {
    if (method !== 'get') {
        return { status: 405, jsonBody: { error: 'Method Not Allowed', message: 'Only GET is supported' } };
    }

    if (!deviceId) {
        return { status: 400, jsonBody: { error: 'Bad Request', message: 'deviceId is required' } };
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'short';

    if (type === 'long') {
        const result = await wattwatchersService.getLongEnergyLatest(deviceId, siteId);
        return { status: 200, jsonBody: result };
    } else {
        const result = await wattwatchersService.getShortEnergyLatest(deviceId, siteId);
        return { status: 200, jsonBody: result };
    }
}
