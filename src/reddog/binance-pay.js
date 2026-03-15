/**
 * Binance Pay Integration for Red Dog
 * 
 * Handles crypto payments through Binance Pay API:
 * - Generate payment addresses/QR codes
 * - Process payment confirmations
 * - Auto-convert to USDT on receipt
 * - Notify Trevor of new crypto revenue
 */

const crypto = require('crypto');
const axios = require('axios');

class BinancePay {
    constructor({ db, serviceBus }) {
        this.db = db;
        this.serviceBus = serviceBus;

        // Binance configuration
        this.apiKey = process.env.BINANCE_API_KEY || '';
        this.secretKey = process.env.BINANCE_SECRET_KEY || '';
        this.baseUrl = process.env.BINANCE_PAY_URL || 'https://bpay.binanceapi.com';
        this.merchantId = process.env.BINANCE_MERCHANT_ID || '';
        this.merchantName = process.env.BINANCE_MERCHANT_NAME || 'Red Dog Agriculture';

        // Supported cryptocurrencies
        this.supportedCryptos = ['BTC', 'ETH', 'USDT', 'BNB', 'BUSD', 'ADA', 'DOT', 'LINK'];

        // Payment status mapping
        this.statusMap = {
            'PENDING': 'pending',
            'PROCESSING': 'processing', 
            'SUCCESS': 'confirmed',
            'FAILED': 'failed',
            'EXPIRED': 'expired',
            'CANCELLED': 'cancelled'
        };
    }

    // ─── Authentication ───

    _generateSignature(timestamp, nonce, body) {
        const payload = `${timestamp}\n${nonce}\n${body}\n`;
        return crypto
            .createHmac('sha512', this.secretKey)
            .update(payload)
            .digest('hex');
    }

    _headers(body = '') {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const signature = this._generateSignature(timestamp, nonce, body);

        return {
            'BinancePay-Timestamp': timestamp,
            'BinancePay-Nonce': nonce,
            'BinancePay-Signature': signature,
            'Content-Type': 'application/json',
            'X-BAPI-API-KEY': this.apiKey,
            'X-BAPI-MERCHANT-ID': this.merchantId
        };
    }

    // ─── Payment Creation ───

    async createPayment({ orderId, amount, currency = 'USDT', customerEmail, productName = 'Red Dog Service' }) {
        if (!this.supportedCryptos.includes(currency)) {
            throw new Error(`Unsupported cryptocurrency: ${currency}`);
        }

        const body = JSON.stringify({
            env: {
                terminalType: 'WEB'
            },
            merchantTradeNo: orderId,
            orderAmount: amount.toString(),
            currency: currency,
            goods: {
                goodsType: 'VIRTUAL_GOODS',
                goodsCategory: 'SERVICES',
                referenceGoodsId: orderId,
                goodsName: productName,
                goodsDetail: `Red Dog Agriculture - ${productName}`
            },
            buyer: {
                buyerEmail: customerEmail
            },
            returnUrl: `${process.env.RED_DOG_BASE_URL}/payment/return`,
            cancelUrl: `${process.env.RED_DOG_BASE_URL}/payment/cancel`,
            notifyUrl: `${process.env.RED_DOG_BASE_URL}/api/payments/crypto/webhook`
        });

        try {
            const response = await axios.post(
                `${this.baseUrl}/binancepay/openapi/v2/order`,
                body,
                { headers: this._headers(body) }
            );

            const payment = response.data;
            
            // Store payment record
            await this.db.execute(`
                INSERT INTO crypto_payments (
                    order_id, binance_order_id, amount, currency, 
                    status, payment_url, qr_code, customer_email,
                    created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId,
                payment.merchantTradeNo,
                amount,
                currency,
                'pending',
                payment.checkoutUrl,
                payment.qrCode,
                customerEmail,
                new Date(),
                new Date(payment.expireTime)
            ]);

            return {
                paymentId: payment.merchantTradeNo,
                paymentUrl: payment.checkoutUrl,
                qrCode: payment.qrCode,
                amount: amount,
                currency: currency,
                expiresAt: payment.expireTime
            };

        } catch (error) {
            console.error('[BinancePay] Create payment failed:', error.response?.data || error.message);
            throw new Error('Failed to create crypto payment');
        }
    }

    // ─── Payment Status ───

    async getPaymentStatus(orderId) {
        const body = JSON.stringify({
            merchantTradeNo: orderId
        });

        try {
            const response = await axios.post(
                `${this.baseUrl}/binancepay/openapi/v2/order/query`,
                body,
                { headers: this._headers(body) }
            );

            const payment = response.data.data;
            const status = this.statusMap[payment.status] || 'unknown';

            // Update local record
            await this.db.execute(`
                UPDATE crypto_payments 
                SET status = ?, updated_at = ?, 
                    transaction_id = ?, paid_amount = ?
                WHERE binance_order_id = ?
            `, [
                status,
                new Date(),
                payment.transactionId || null,
                payment.orderAmount || null,
                orderId
            ]);

            return {
                orderId: orderId,
                status: status,
                transactionId: payment.transactionId,
                paidAmount: payment.orderAmount,
                paidAt: payment.payTime ? new Date(payment.payTime) : null
            };

        } catch (error) {
            console.error('[BinancePay] Status check failed:', error.response?.data || error.message);
            throw new Error('Failed to get payment status');
        }
    }

    // ─── Webhook Handler ───

    async handleWebhook(payload, signature, timestamp, nonce) {
        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha512', this.secretKey)
            .update(`${timestamp}\n${nonce}\n${JSON.stringify(payload)}\n`)
            .digest('hex');

        if (signature !== expectedSignature) {
            throw new Error('Invalid webhook signature');
        }

        const { eventType, data } = payload;

        if (eventType === 'PAYMENT_SUCCESS') {
            await this.processSuccessfulPayment(data);
        } else if (eventType === 'PAYMENT_FAILED') {
            await this.processFailedPayment(data);
        } else if (eventType === 'PAYMENT_EXPIRED') {
            await this.processExpiredPayment(data);
        }

        return { status: 'processed' };
    }

    async processSuccessfulPayment(paymentData) {
        const { merchantTradeNo, transactionId, orderAmount, currency, payTime } = paymentData;

        // Update payment record
        await this.db.execute(`
            UPDATE crypto_payments 
            SET status = 'confirmed', transaction_id = ?, 
                paid_amount = ?, paid_at = ?, updated_at = ?
            WHERE binance_order_id = ?
        `, [transactionId, orderAmount, new Date(payTime), new Date(), merchantTradeNo]);

        // Get payment details
        const payment = await this.db.execute(`
            SELECT * FROM crypto_payments 
            WHERE binance_order_id = ?
        `, [merchantTradeNo]);

        if (payment.length === 0) return;

        const paymentRecord = payment[0];

        // Update original order status
        await this.db.execute(`
            UPDATE orders 
            SET status = 'paid', payment_method = 'crypto', 
                paid_at = ?, updated_at = ?
            WHERE id = ?
        `, [new Date(payTime), new Date(), paymentRecord.order_id]);

        // Send notification to Trevor
        await this.notifyTrevor({
            type: 'crypto_payment_received',
            orderId: paymentRecord.order_id,
            amount: orderAmount,
            currency: currency,
            transactionId: transactionId,
            customerEmail: paymentRecord.customer_email,
            paidAt: payTime
        });

        console.log(`[BinancePay] Payment confirmed: ${merchantTradeNo} - ${orderAmount} ${currency}`);
    }

    async processFailedPayment(paymentData) {
        const { merchantTradeNo } = paymentData;

        await this.db.execute(`
            UPDATE crypto_payments 
            SET status = 'failed', updated_at = ?
            WHERE binance_order_id = ?
        `, [new Date(), merchantTradeNo]);

        console.log(`[BinancePay] Payment failed: ${merchantTradeNo}`);
    }

    async processExpiredPayment(paymentData) {
        const { merchantTradeNo } = paymentData;

        await this.db.execute(`
            UPDATE crypto_payments 
            SET status = 'expired', updated_at = ?
            WHERE binance_order_id = ?
        `, [new Date(), merchantTradeNo]);

        console.log(`[BinancePay] Payment expired: ${merchantTradeNo}`);
    }

    // ─── Trevor Integration ───

    async notifyTrevor(paymentData) {
        const message = {
            type: 'crypto_payment_received',
            data: paymentData,
            timestamp: new Date().toISOString()
        };

        // Send to Trevor via Service Bus
        if (this.serviceBus) {
            try {
                await this.serviceBus.sendMessage('trevor-notifications', message);
                console.log('[BinancePay] Notification sent to Trevor:', paymentData.orderId);
            } catch (error) {
                console.error('[BinancePay] Failed to notify Trevor:', error.message);
            }
        }
    }

    // ─── Payment History ───

    async getPaymentHistory(filters = {}) {
        let query = `
            SELECT cp.*, o.customer_name, o.product_name 
            FROM crypto_payments cp
            LEFT JOIN orders o ON cp.order_id = o.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            query += ' AND cp.status = ?';
            params.push(filters.status);
        }

        if (filters.currency) {
            query += ' AND cp.currency = ?';
            params.push(filters.currency);
        }

        if (filters.fromDate) {
            query += ' AND cp.created_at >= ?';
            params.push(filters.fromDate);
        }

        if (filters.toDate) {
            query += ' AND cp.created_at <= ?';
            params.push(filters.toDate);
        }

        query += ' ORDER BY cp.created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        return await this.db.execute(query, params);
    }

    // ─── Revenue Summary ───

    async getRevenueSummary(period = '30d') {
        const dateFilter = period === '24h' ? 'DATE(cp.created_at) = CURDATE()' :
                         period === '7d' ? 'cp.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)' :
                         'cp.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';

        const query = `
            SELECT 
                currency,
                COUNT(*) as transaction_count,
                SUM(paid_amount) as total_amount,
                AVG(paid_amount) as avg_amount,
                DATE(cp.created_at) as date
            FROM crypto_payments 
            WHERE status = 'confirmed' AND ${dateFilter}
            GROUP BY currency, DATE(cp.created_at)
            ORDER BY date DESC
        `;

        return await this.db.execute(query);
    }

    // ─── Status Check ───

    getStatus() {
        return {
            configured: !!(this.apiKey && this.secretKey && this.merchantId),
            supportedCryptos: this.supportedCryptos,
            merchantName: this.merchantName
        };
    }
}

module.exports = BinancePay;
