/**
 * Crypto Payment Routes for Red Dog
 * 
 * REST endpoints for Binance Pay integration:
 * - Create crypto payments
 * - Check payment status
 * - Handle Binance webhooks
 * - Payment history and revenue
 */

const express = require('express');
const BinancePay = require('../binance-pay');

function createCryptoRoutes(db, serviceBus) {
    const router = express.Router();
    const binancePay = new BinancePay({ db, serviceBus });

    // ─── Create Crypto Payment ───────────────────────────────────────────────
    router.post('/create', async (req, res) => {
        try {
            const { orderId, amount, currency = 'USDT', customerEmail, productName } = req.body;

            // Validate required fields
            if (!orderId || !amount || !customerEmail) {
                return res.status(400).json({
                    error: 'Missing required fields: orderId, amount, customerEmail'
                });
            }

            // Validate amount
            if (amount <= 0) {
                return res.status(400).json({
                    error: 'Amount must be greater than 0'
                });
            }

            // Check if order exists
            const order = await db.execute(
                'SELECT * FROM orders WHERE id = ?',
                [orderId]
            );

            if (order.length === 0) {
                return res.status(404).json({
                    error: 'Order not found'
                });
            }

            // Create crypto payment
            const payment = await binancePay.createPayment({
                orderId,
                amount: parseFloat(amount),
                currency,
                customerEmail,
                productName: productName || `Order ${orderId}`
            });

            res.json({
                success: true,
                payment: {
                    paymentId: payment.paymentId,
                    paymentUrl: payment.paymentUrl,
                    qrCode: payment.qrCode,
                    amount: payment.amount,
                    currency: payment.currency,
                    expiresAt: payment.expiresAt
                }
            });

        } catch (error) {
            console.error('[Crypto Routes] Create payment error:', error);
            res.status(500).json({
                error: 'Failed to create crypto payment',
                message: error.message
            });
        }
    });

    // ─── Check Payment Status ─────────────────────────────────────────────────
    router.get('/status/:orderId', async (req, res) => {
        try {
            const { orderId } = req.params;

            const status = await binancePay.getPaymentStatus(orderId);

            res.json({
                success: true,
                status: status
            });

        } catch (error) {
            console.error('[Crypto Routes] Status check error:', error);
            res.status(500).json({
                error: 'Failed to check payment status',
                message: error.message
            });
        }
    });

    // ─── Binance Webhook Handler ───────────────────────────────────────────────
    router.post('/webhook', async (req, res) => {
        try {
            const signature = req.headers['binancepay-signature'];
            const timestamp = req.headers['binancepay-timestamp'];
            const nonce = req.headers['binancepay-nonce'];

            if (!signature || !timestamp || !nonce) {
                return res.status(400).json({
                    error: 'Missing required Binance Pay headers'
                });
            }

            const result = await binancePay.handleWebhook(
                req.body,
                signature,
                timestamp,
                nonce
            );

            res.json(result);

        } catch (error) {
            console.error('[Crypto Routes] Webhook error:', error);
            
            // Return error but still acknowledge receipt to prevent retries
            res.status(400).json({
                error: 'Webhook processing failed',
                message: error.message
            });
        }
    });

    // ─── Payment History ───────────────────────────────────────────────────────
    router.get('/history', async (req, res) => {
        try {
            const { status, currency, fromDate, toDate, limit = 50 } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (currency) filters.currency = currency;
            if (fromDate) filters.fromDate = fromDate;
            if (toDate) filters.toDate = toDate;
            if (limit) filters.limit = parseInt(limit);

            const history = await binancePay.getPaymentHistory(filters);

            res.json({
                success: true,
                payments: history,
                count: history.length
            });

        } catch (error) {
            console.error('[Crypto Routes] History error:', error);
            res.status(500).json({
                error: 'Failed to get payment history',
                message: error.message
            });
        }
    });

    // ─── Revenue Summary ───────────────────────────────────────────────────────
    router.get('/revenue', async (req, res) => {
        try {
            const { period = '30d' } = req.query;

            const revenue = await binancePay.getRevenueSummary(period);

            res.json({
                success: true,
                period: period,
                revenue: revenue
            });

        } catch (error) {
            console.error('[Crypto Routes] Revenue error:', error);
            res.status(500).json({
                error: 'Failed to get revenue summary',
                message: error.message
            });
        }
    });

    // ─── Supported Cryptocurrencies ───────────────────────────────────────────
    router.get('/supported', async (req, res) => {
        try {
            const status = binancePay.getStatus();

            res.json({
                success: true,
                supportedCryptos: status.supportedCryptos,
                merchantName: status.merchantName,
                configured: status.configured
            });

        } catch (error) {
            console.error('[Crypto Routes] Supported cryptos error:', error);
            res.status(500).json({
                error: 'Failed to get supported cryptocurrencies',
                message: error.message
            });
        }
    });

    // ─── Service Status ───────────────────────────────────────────────────────
    router.get('/status', async (req, res) => {
        try {
            const status = binancePay.getStatus();

            res.json({
                success: true,
                binancePay: status
            });

        } catch (error) {
            console.error('[Crypto Routes] Status error:', error);
            res.status(500).json({
                error: 'Failed to get service status',
                message: error.message
            });
        }
    });

    return router;
}

module.exports = createCryptoRoutes;
