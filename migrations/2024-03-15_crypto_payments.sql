-- Crypto Payments Table for Binance Pay Integration
-- Stores cryptocurrency payment records and tracks status

CREATE TABLE IF NOT EXISTS crypto_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,              -- Reference to original order
    binance_order_id VARCHAR(100) NOT NULL,     -- Binance Pay merchant trade number
    amount DECIMAL(20, 8) NOT NULL,             -- Payment amount
    currency VARCHAR(10) NOT NULL,              -- Cryptocurrency (BTC, ETH, USDT, etc.)
    status ENUM('pending', 'processing', 'confirmed', 'failed', 'expired', 'cancelled') DEFAULT 'pending',
    payment_url TEXT,                           -- Binance Pay checkout URL
    qr_code TEXT,                              -- QR code for payment
    customer_email VARCHAR(255),               -- Customer email for payment
    transaction_id VARCHAR(100),                -- Blockchain transaction ID
    paid_amount DECIMAL(20, 8),                -- Actual amount paid (may differ due to fees)
    paid_at DATETIME,                          -- When payment was confirmed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at DATETIME,                       -- Payment expiry time
    
    INDEX idx_order_id (order_id),
    INDEX idx_binance_order_id (binance_order_id),
    INDEX idx_status (status),
    INDEX idx_currency (currency),
    INDEX idx_created_at (created_at),
    INDEX idx_transaction_id (transaction_id)
);

-- Add crypto payment method to orders table
ALTER TABLE orders 
ADD COLUMN payment_method ENUM('stripe', 'crypto', 'bank_transfer', 'paypal') DEFAULT 'stripe' AFTER status,
ADD COLUMN crypto_payment_id INT NULL AFTER payment_method,
ADD FOREIGN KEY (crypto_payment_id) REFERENCES crypto_payments(id) ON DELETE SET NULL;

-- Add indexes for payment queries
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_crypto_payment_id ON orders(crypto_payment_id);

-- Revenue tracking view
CREATE OR REPLACE VIEW crypto_revenue_summary AS
SELECT 
    DATE(paid_at) as date,
    currency,
    COUNT(*) as transaction_count,
    SUM(paid_amount) as total_amount,
    AVG(paid_amount) as average_amount,
    MIN(paid_amount) as min_amount,
    MAX(paid_amount) as max_amount
FROM crypto_payments 
WHERE status = 'confirmed' AND paid_at IS NOT NULL
GROUP BY DATE(paid_at), currency
ORDER BY date DESC;
