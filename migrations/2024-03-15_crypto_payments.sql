-- Crypto Payments Table for Binance Pay Integration (MSSQL/Azure SQL version)
-- Stores cryptocurrency payment records and tracks status
-- Uses reddog schema to match Red Dog's database structure

-- Create reddog schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'reddog')
BEGIN
    EXEC('CREATE SCHEMA [reddog]');
    PRINT 'Created reddog schema';
END
GO

-- Check if table exists and create if not
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CryptoPayments' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[CryptoPayments] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrderReference NVARCHAR(50) NOT NULL,         -- Reference to billing/order transaction
        BinanceOrderId NVARCHAR(100) NOT NULL,       -- Binance Pay merchant trade number
        Amount DECIMAL(20, 8) NOT NULL,              -- Payment amount
        Currency NVARCHAR(10) NOT NULL,              -- Cryptocurrency (BTC, ETH, USDT, etc.)
        Status NVARCHAR(20) DEFAULT 'pending' CHECK (Status IN ('pending', 'processing', 'confirmed', 'failed', 'expired', 'cancelled')),
        PaymentUrl NVARCHAR(MAX),                    -- Binance Pay checkout URL
        QrCode NVARCHAR(MAX),                       -- QR code for payment
        CustomerEmail NVARCHAR(255),                -- Customer email for payment
        UserOid NVARCHAR(100),                       -- Red Dog user account reference
        TransactionId NVARCHAR(100),                 -- Blockchain transaction ID
        PaidAmount DECIMAL(20, 8),                   -- Actual amount paid (may differ due to fees)
        PaidAt DATETIME2,                            -- When payment was confirmed
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2 DEFAULT GETDATE(),
        ExpiresAt DATETIME2,                         -- Payment expiry time
        
        -- Foreign key to Red Dog billing account
        FOREIGN KEY (UserOid) REFERENCES [reddog].[BillingAccounts](UserOid)
    );

    -- Add indexes
    CREATE INDEX IX_CryptoPayments_OrderReference ON [reddog].[CryptoPayments](OrderReference);
    CREATE INDEX IX_CryptoPayments_BinanceOrderId ON [reddog].[CryptoPayments](BinanceOrderId);
    CREATE INDEX IX_CryptoPayments_Status ON [reddog].[CryptoPayments](Status);
    CREATE INDEX IX_CryptoPayments_Currency ON [reddog].[CryptoPayments](Currency);
    CREATE INDEX IX_CryptoPayments_CreatedAt ON [reddog].[CryptoPayments](CreatedAt);
    CREATE INDEX IX_CryptoPayments_TransactionId ON [reddog].[CryptoPayments](TransactionId);
    CREATE INDEX IX_CryptoPayments_UserOid ON [reddog].[CryptoPayments](UserOid);
    
    PRINT 'Created reddog.CryptoPayments table';
END
GO

-- Add crypto payment tracking to billing accounts if column doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('[reddog].[BillingAccounts]') AND name = 'CryptoPaymentId')
BEGIN
    ALTER TABLE [reddog].[BillingAccounts]
    ADD CryptoPaymentId INT NULL;
    PRINT 'Added CryptoPaymentId to BillingAccounts';
END
GO

-- Add foreign key constraint if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BillingAccounts_CryptoPayments')
BEGIN
    ALTER TABLE [reddog].[BillingAccounts]
    ADD CONSTRAINT FK_BillingAccounts_CryptoPayments FOREIGN KEY (CryptoPaymentId) REFERENCES [reddog].[CryptoPayments](Id) ON DELETE SET NULL;
    PRINT 'Added foreign key constraint for crypto payments';
END
GO

-- Revenue tracking view (drop and recreate to ensure latest schema)
IF EXISTS (SELECT * FROM sys.views WHERE name = 'crypto_revenue_summary' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    EXEC('DROP VIEW [reddog].[crypto_revenue_summary]');
END;

EXEC('
CREATE VIEW [reddog].[crypto_revenue_summary] AS
SELECT 
    CAST(PaidAt AS DATE) as date,
    Currency,
    COUNT(*) as transaction_count,
    SUM(PaidAmount) as total_amount,
    AVG(PaidAmount) as average_amount,
    MIN(PaidAmount) as min_amount,
    MAX(PaidAmount) as max_amount
FROM [reddog].[CryptoPayments] 
WHERE Status = ''confirmed'' AND PaidAt IS NOT NULL
GROUP BY CAST(PaidAt AS DATE), Currency
');

PRINT '=== Crypto Payments Migration Completed ===';
PRINT 'Schema: [reddog]';
PRINT 'Tables: CryptoPayments (linked to BillingAccounts)';
PRINT 'View: crypto_revenue_summary';
PRINT 'Ready for Binance Pay integration';
