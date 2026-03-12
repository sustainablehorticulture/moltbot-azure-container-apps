const { app } = require('@azure/functions');
const selectronicService = require('../services/selectronicService');

/**
 * Selectronic SP PRO sensor data proxy.
 *
 * Route:  GET /api/selectronic/{action}?siteId={farmName}
 *   or:   GET /api/selectronic/{farmName}/{action}   (route override)
 *
 * Actions:
 *   latest   — current battery SoC, solar/grid/load power, daily energy
 *   devices  — list SP PRO units registered to the site
 *   history  — historical data (pass ?hours=48, default 24)
 *
 * Auth: Azure Function key (Ocp-Apim-Subscription-Key via APIM)
 * Credentials fetched from per-farm Key Vault via Managed Identity.
 *
 * Examples:
 *   GET /api/selectronic/latest?siteId=GrassgumFarm
 *   GET /api/selectronic/history?siteId=GrassgumFarm&hours=48
 *   GET /api/selectronic/devices?siteId=GrassgumFarm
 */
app.http('selectronic', {
    methods: ['GET'],
    authLevel: 'function',
    route: 'selectronic/{action}',
    handler: async (request, context) => {
        const { action } = request.params;
        const farmName = request.query.get('siteId') || request.query.get('farmName');

        if (!farmName) {
            return {
                status: 400,
                jsonBody: { error: 'Bad Request', message: 'siteId query parameter is required (e.g. ?siteId=GrassgumFarm)' }
            };
        }

        context.log(`[Selectronic] farm=${farmName} action=${action}`);

        try {
            switch (action) {

                case 'latest': {
                    const data = await selectronicService.getLatest(farmName);
                    return { status: 200, jsonBody: data };
                }

                case 'devices': {
                    const data = await selectronicService.getDevices(farmName);
                    return { status: 200, jsonBody: data };
                }

                case 'history': {
                    const hours = parseInt(request.query.get('hours') || '24', 10);
                    const data = await selectronicService.getHistory(farmName, hours);
                    return { status: 200, jsonBody: data };
                }

                default:
                    return {
                        status: 404,
                        jsonBody: {
                            error: 'Not Found',
                            message: `Unknown action: '${action}'. Available: latest, devices, history`
                        }
                    };
            }
        } catch (err) {
            context.log.error(`[Selectronic] Error for farm=${farmName} action=${action}:`, err.message);

            const isAuthError = err.message.includes('login failed') || err.message.includes('401');
            return {
                status: isAuthError ? 401 : 500,
                jsonBody: {
                    error: isAuthError ? 'Authentication Failed' : 'Internal Server Error',
                    message: err.message,
                    farmName,
                    action
                }
            };
        }
    }
});
