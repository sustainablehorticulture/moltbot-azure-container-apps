const { app } = require('@azure/functions');
const axios = require('axios');
const twilio = require('twilio');
const pendingActions = require('../services/pendingActions');
const smsService = require('../services/smsService');

// Twilio inbound SMS webhook - receives replies to alert messages
// Auth is anonymous because Twilio cannot send function keys
app.http('smsWebhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'sms/webhook',
    handler: async (request, context) => {
        context.log('Twilio SMS webhook triggered');

        try {
            // Parse Twilio webhook form data
            const formData = await parseFormData(request);

            const from = formData.From;       // User's phone number
            const body = (formData.Body || '').trim().toUpperCase();
            const to = formData.To;           // Our Twilio number
            const messageSid = formData.MessageSid;

            context.log(`SMS received from ${from}: "${body}" (SID: ${messageSid})`);

            // Validate Twilio signature if configured
            if (process.env.TWILIO_AUTH_TOKEN && process.env.VALIDATE_TWILIO_SIGNATURE === 'true') {
                const signature = request.headers.get('x-twilio-signature');
                const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
                if (webhookUrl && signature) {
                    const isValid = twilio.validateRequest(
                        process.env.TWILIO_AUTH_TOKEN,
                        signature,
                        webhookUrl,
                        formData
                    );
                    if (!isValid) {
                        context.log.warn('Invalid Twilio signature - rejecting request');
                        return { status: 403, body: 'Invalid signature' };
                    }
                }
            }

            // Look up pending action for this phone number
            const pendingAction = pendingActions.getPendingActionByPhone(from);

            if (!pendingAction) {
                context.log(`No pending action for ${from}`);
                return twimlResponse('No pending alert action found. Actions expire after 30 minutes.');
            }

            // Parse the reply
            const isYes = ['YES', 'Y', 'YEP', 'YEAH', 'OK', 'CONFIRM', 'DO IT', '1'].includes(body);
            const isNo = ['NO', 'N', 'NOPE', 'NAH', 'CANCEL', 'STOP', '0'].includes(body);

            if (!isYes && !isNo) {
                return twimlResponse(`Reply YES or NO to the alert action. You said: "${formData.Body}"`);
            }

            const actionToExecute = isYes ? pendingAction.yesAction : pendingAction.noAction;
            const replyType = isYes ? 'YES' : 'NO';

            // If NO and no noAction defined, just acknowledge
            if (isNo && !actionToExecute) {
                pendingActions.completeAction(pendingAction.id, 'NO', { acknowledged: true });
                return twimlResponse('Alert acknowledged. No action taken.');
            }

            // Execute the action
            context.log(`Executing ${replyType} action for ${from}: ${JSON.stringify(actionToExecute)}`);
            const result = await executeAction(actionToExecute, context);

            // Mark action as completed
            pendingActions.completeAction(pendingAction.id, replyType, result);

            // Build confirmation message
            const confirmMsg = result.success
                ? `Action completed: ${actionToExecute.description || actionToExecute.type}. ${result.message || ''}`
                : `Action failed: ${result.error || 'Unknown error'}`;

            context.log(`Action result for ${from}: ${confirmMsg}`);

            return twimlResponse(confirmMsg);

        } catch (error) {
            context.log.error('Error processing SMS webhook:', error);
            return twimlResponse('Sorry, there was an error processing your reply. Please try again.');
        }
    }
});

/**
 * Execute a device control action (LoRaWAN or Wattwatchers)
 */
async function executeAction(action, context) {
    const lorawanBaseUrl = process.env.LORAWAN_FUNCTION_URL || 'https://backendlorawan.azurewebsites.net';
    const lorawanKey = process.env.LORAWAN_FUNCTION_KEY || '';

    try {
        switch (action.type) {
            case 'lorawan-relay': {
                const url = `${lorawanBaseUrl}/api/sites/${action.siteId}/relays/${action.deviceId}`;
                const response = await axios.post(url, {
                    relayId: action.relayId,
                    state: action.state
                }, {
                    headers: { 'x-functions-key': lorawanKey, 'Content-Type': 'application/json' }
                });
                return {
                    success: true,
                    message: `Relay ${action.relayId} set to ${action.state ? 'ON' : 'OFF'} on ${action.deviceId}`,
                    data: response.data
                };
            }

            case 'lorawan-digital': {
                const url = `${lorawanBaseUrl}/api/sites/${action.siteId}/digital/${action.deviceId}`;
                const response = await axios.post(url, {
                    pinId: action.pinId,
                    state: action.state,
                    mode: action.mode || 'output'
                }, {
                    headers: { 'x-functions-key': lorawanKey, 'Content-Type': 'application/json' }
                });
                return {
                    success: true,
                    message: `Digital pin ${action.pinId} set to ${action.state ? 'ON' : 'OFF'} on ${action.deviceId}`,
                    data: response.data
                };
            }

            case 'wattwatchers-switch': {
                const url = `${lorawanBaseUrl}/api/wattwatchers/${action.siteId}/switches/${action.deviceId}`;
                const response = await axios.post(url, {
                    switchId: action.switchId,
                    state: action.state   // "open" or "closed"
                }, {
                    headers: { 'x-functions-key': lorawanKey, 'Content-Type': 'application/json' }
                });
                const stateLabel = action.state === 'closed' ? 'ON' : 'OFF';
                return {
                    success: true,
                    message: `Switch ${action.switchId} set to ${stateLabel} on Wattwatchers ${action.deviceId}`,
                    data: response.data
                };
            }

            case 'wattwatchers-multi-switch': {
                const url = `${lorawanBaseUrl}/api/wattwatchers/${action.siteId}/switches/${action.deviceId}`;
                const response = await axios.post(url, {
                    switches: action.switches
                }, {
                    headers: { 'x-functions-key': lorawanKey, 'Content-Type': 'application/json' }
                });
                return {
                    success: true,
                    message: `${action.switches.length} switches updated on Wattwatchers ${action.deviceId}`,
                    data: response.data
                };
            }

            case 'custom': {
                // Custom HTTP action
                const response = await axios({
                    method: action.method || 'POST',
                    url: action.url,
                    data: action.body,
                    headers: action.headers || { 'Content-Type': 'application/json' }
                });
                return {
                    success: true,
                    message: action.description || 'Custom action completed',
                    data: response.data
                };
            }

            default:
                return {
                    success: false,
                    error: `Unknown action type: ${action.type}`
                };
        }
    } catch (error) {
        context.log.error(`Action execution failed:`, error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Parse URL-encoded form data from Twilio webhook POST
 */
async function parseFormData(request) {
    const contentType = request.headers.get('content-type') || '';
    const params = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
        const text = await request.text();
        const urlParams = new URLSearchParams(text);
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
    } else if (contentType.includes('application/json')) {
        return await request.json();
    } else {
        // Try form data anyway
        const text = await request.text();
        const urlParams = new URLSearchParams(text);
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
    }

    return params;
}

/**
 * Generate TwiML XML response for Twilio
 */
function twimlResponse(message) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${escapeXml(message)}</Message>
</Response>`;

    return {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml
    };
}

function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
