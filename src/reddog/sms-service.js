class SMSService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        this.enabled = !!(this.accountSid && this.authToken && this.fromNumber);
        this._client = null;
    }

    getClient() {
        if (!this._client) {
            const twilio = require('twilio');
            this._client = twilio(this.accountSid, this.authToken);
        }
        return this._client;
    }

    async sendSMS(to, body) {
        if (!this.enabled) throw new Error('Twilio not configured');
        const message = await this.getClient().messages.create({
            body,
            from: this.fromNumber,
            to
        });
        console.log(`[SMS] Sent to ${to}: ${message.sid}`);
        return message.sid;
    }
}

module.exports = SMSService;
