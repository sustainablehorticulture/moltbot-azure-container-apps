const { v4: uuidv4 } = require('uuid');

const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class DeviceCommands {
    constructor({ functionsClient, smsService = null }) {
        this.functions = functionsClient;
        this.smsService = smsService;
        // Map: userId -> pending confirmation { id, command, expiresAt, channelId }
        this.pendingByUser = new Map();
        // Map: phoneNumber -> pending confirmation (for SMS replies)
        this.pendingByPhone = new Map();
    }

    // ── Intent detection ─────────────────────────────────────────────────

    /**
     * Parse a device_control JSON block from AI response text.
     * The AI emits: {"action":"device_control","device_type":"...","device_id":"...",...}
     */
    parseDeviceAction(aiResponseText) {
        const match = aiResponseText.match(/\{[\s\S]*?"action"\s*:\s*"device_control"[\s\S]*?\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    /**
     * Returns true if the message is a yes/no confirmation reply.
     */
    isConfirmation(message) {
        return /^\s*(yes|y|no|n|confirm|cancel|ok|nope|yep|sure|abort)\s*$/i.test(message.trim());
    }

    isYes(message) {
        return /^\s*(yes|y|confirm|ok|yep|sure)\s*$/i.test(message.trim());
    }

    // ── Pending confirmations ────────────────────────────────────────────

    createPending(userId, command, channelId = null) {
        const id = uuidv4();
        const record = {
            id,
            userId,
            command,
            channelId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + CONFIRMATION_TIMEOUT_MS).toISOString()
        };
        this.pendingByUser.set(userId, record);
        return record;
    }

    getPendingForUser(userId) {
        const record = this.pendingByUser.get(userId);
        if (!record) return null;
        if (new Date(record.expiresAt) < new Date()) {
            this.pendingByUser.delete(userId);
            return null;
        }
        return record;
    }

    clearPendingForUser(userId) {
        this.pendingByUser.delete(userId);
    }

    // ── Chat confirmation flow ───────────────────────────────────────────

    /**
     * Called from AI engine when a device_control action is detected.
     * Returns a confirmation prompt string.
     */
    async requestConfirmation(action, userId, channelId = null) {
        const description = this.describeAction(action);
        this.createPending(userId, action, channelId);

        let msg = `🔌 **Device Control Request**\n${description}\n\nReply **YES** to execute or **NO** to cancel. _(expires in 5 minutes)_`;

        // Optionally also send SMS if phone number is configured
        if (this.smsService && process.env.ALERT_PHONE_NUMBER) {
            try {
                const smsMsg = `Red Dog: Confirm farm command?\n${this.describeActionPlain(action)}\nReply YES to execute or NO to cancel.`;
                await this.smsService.sendSMS(process.env.ALERT_PHONE_NUMBER, smsMsg);
                this.pendingByPhone.set(process.env.ALERT_PHONE_NUMBER, { userId, command: action });
                msg += `\n📱 SMS confirmation also sent to your phone.`;
            } catch (err) {
                console.warn('[DeviceCommands] Failed to send SMS confirmation:', err.message);
            }
        }

        return msg;
    }

    /**
     * Called when user replies yes/no in chat.
     * Returns { executed: bool, reply: string }
     */
    async resolveConfirmation(userId, message) {
        const pending = this.getPendingForUser(userId);
        if (!pending) {
            return { executed: false, reply: null }; // no pending action — not a confirmation
        }

        this.clearPendingForUser(userId);
        this.pendingByPhone.delete(process.env.ALERT_PHONE_NUMBER);

        if (this.isYes(message)) {
            return await this.executeCommand(pending.command);
        } else {
            return { executed: false, reply: `🚫 Alright, mate — command cancelled. No changes made.` };
        }
    }

    // ── SMS webhook flow ─────────────────────────────────────────────────

    /**
     * Called by Twilio SMS webhook when a reply arrives.
     * Returns { executed: bool, reply: string } or null if no pending action.
     */
    async resolveSMSConfirmation(phoneNumber, message) {
        const pending = this.pendingByPhone.get(phoneNumber);
        if (!pending) return null;

        this.pendingByPhone.delete(phoneNumber);
        if (pending.userId) this.clearPendingForUser(pending.userId);

        if (this.isYes(message)) {
            const result = await this.executeCommand(pending.command);
            // Send SMS result back
            if (this.smsService) {
                const smsReply = result.executed
                    ? `✅ Red Dog: Done! ${this.describeActionPlain(pending.command)} — executed successfully.`
                    : `❌ Red Dog: Failed — ${result.reply}`;
                try {
                    await this.smsService.sendSMS(phoneNumber, smsReply);
                } catch (err) {
                    console.warn('[DeviceCommands] Failed to send SMS result:', err.message);
                }
            }
            // Include userId so webhook can inject into chat history
            return { ...result, userId: pending.userId };
        } else {
            if (this.smsService) {
                try {
                    await this.smsService.sendSMS(phoneNumber, 'Red Dog: Command cancelled. No changes made.');
                } catch (err) { /* ignore */ }
            }
            return { executed: false, reply: 'Command cancelled via SMS.', userId: pending.userId };
        }
    }

    // ── Command execution ────────────────────────────────────────────────

    async executeCommand(action) {
        if (!this.functions || !this.functions.enabled) {
            return { executed: false, reply: `⚠️ Azure Functions not configured. Set AZURE_FUNCTIONS_URL and AZURE_FUNCTIONS_KEY in your .env to enable device control.` };
        }

        try {
            let result;
            switch (action.device_type) {
                case 'lorawan_relay':
                    result = await this.functions.controlRelay(
                        action.device_id,
                        action.relay_id,
                        action.state
                    );
                    return {
                        executed: true,
                        reply: `✅ Done! Relay ${action.relay_id} on **${action.device_id}** is now **${action.state ? 'ON' : 'OFF'}**.\n_Sent LoRaWAN downlink at ${new Date().toLocaleTimeString()}_`
                    };

                case 'lorawan_digital':
                    result = await this.functions.controlDigitalIO(
                        action.device_id,
                        action.pin_id,
                        action.state,
                        action.mode || 'output'
                    );
                    return {
                        executed: true,
                        reply: `✅ Done! Pin ${action.pin_id} on **${action.device_id}** set to **${action.state ? 'HIGH' : 'LOW'}**.\n_Sent LoRaWAN downlink at ${new Date().toLocaleTimeString()}_`
                    };

                case 'wattwatchers_switch':
                    result = await this.functions.controlSwitch(
                        action.device_id,
                        action.switch_id,
                        action.state, // "open" or "closed"
                        action.site_id || null
                    );
                    return {
                        executed: true,
                        reply: `✅ Done! Switch **${action.switch_id}** on WattWatchers device **${action.device_id}** is now **${action.state.toUpperCase()}**.\n_Command sent at ${new Date().toLocaleTimeString()}_`
                    };

                case 'lorawan_status':
                    result = await this.functions.getLoRaWANStatus(action.device_id);
                    return {
                        executed: true,
                        reply: `📊 **Device Status: ${action.device_id}**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
                    };

                case 'lorawan_devices':
                    result = await this.functions.getLoRaWANDevices();
                    return {
                        executed: true,
                        reply: this.formatDeviceList(result)
                    };

                case 'wattwatchers_status':
                    result = await this.functions.getSwitchStatus(action.device_id, action.site_id);
                    return {
                        executed: true,
                        reply: `📊 **WattWatchers Switch Status: ${action.device_id}**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
                    };

                case 'wattwatchers_energy':
                    result = await this.functions.getEnergyLatest(action.device_id, action.site_id);
                    return {
                        executed: true,
                        reply: this.formatEnergyData(result, action.device_id)
                    };

                default:
                    return { executed: false, reply: `❓ Unknown device type: ${action.device_type}` };
            }
        } catch (error) {
            console.error('[DeviceCommands] Execution error:', error.message);
            return {
                executed: false,
                reply: `❌ Command failed: ${error.message}\n\nCheck that the Azure Functions app is running and the device is online.`
            };
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    describeAction(action) {
        switch (action.device_type) {
            case 'lorawan_relay':
                return `Turn **${action.state ? 'ON' : 'OFF'}** Relay ${action.relay_id} on LoRaWAN device **${action.device_id}**`;
            case 'lorawan_digital':
                return `Set Pin ${action.pin_id} **${action.state ? 'HIGH' : 'LOW'}** on LoRaWAN device **${action.device_id}**`;
            case 'wattwatchers_switch':
                return `Set WattWatchers switch **${action.switch_id}** on device **${action.device_id}** to **${(action.state || '').toUpperCase()}**`;
            default:
                return `Execute device command: ${JSON.stringify(action)}`;
        }
    }

    describeActionPlain(action) {
        switch (action.device_type) {
            case 'lorawan_relay':
                return `Relay ${action.relay_id} on ${action.device_id}: ${action.state ? 'ON' : 'OFF'}`;
            case 'lorawan_digital':
                return `Pin ${action.pin_id} on ${action.device_id}: ${action.state ? 'HIGH' : 'LOW'}`;
            case 'wattwatchers_switch':
                return `Switch ${action.switch_id} on ${action.device_id}: ${(action.state || '').toUpperCase()}`;
            default:
                return JSON.stringify(action);
        }
    }

    isReadOnlyAction(action) {
        return ['lorawan_status', 'lorawan_devices', 'wattwatchers_status', 'wattwatchers_energy'].includes(action.device_type);
    }

    formatDeviceList(result) {
        if (!result || !result.devices) return '📋 No devices found.';
        const devices = Array.isArray(result.devices) ? result.devices : result;
        if (!devices.length) return '📋 No LoRaWAN devices registered.';
        const lines = devices.map(d =>
            `• **${d.deviceId}** — ${d.name || 'Unknown'} (${d.location || 'Unknown location'}) — ${d.enabled ? '🟢 Enabled' : '🔴 Disabled'}`
        );
        return `📋 **LoRaWAN Devices (${devices.length})**\n${lines.join('\n')}`;
    }

    formatEnergyData(result, deviceId) {
        if (!result || !result.data) return `📊 No energy data for ${deviceId}.`;
        const d = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!d) return `📊 No recent energy data for ${deviceId}.`;
        const lines = [];
        if (d.realPower) lines.push(`⚡ Real Power: ${d.realPower.map(v => `${v}W`).join(' | ')}`);
        if (d.energy) lines.push(`🔋 Energy: ${d.energy.map(v => `${v}Wh`).join(' | ')}`);
        if (d.powerfactor) lines.push(`📐 Power Factor: ${d.powerfactor.map(v => v.toFixed(2)).join(' | ')}`);
        return `📊 **WattWatchers Energy — ${deviceId}**\n${lines.join('\n') || JSON.stringify(d, null, 2)}`;
    }

    getStatus() {
        return {
            pendingConfirmations: this.pendingByUser.size,
            pendingSMSConfirmations: this.pendingByPhone.size,
            functionsEnabled: this.functions?.enabled || false
        };
    }
}

module.exports = DeviceCommands;
