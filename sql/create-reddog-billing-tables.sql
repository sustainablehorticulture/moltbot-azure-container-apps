-- Create billing system tables for Red Dog farm data monetization
-- Run this as db_owner on zerosumag database
-- Tables live in [reddog] schema for Red Dog's ownership

-- Create reddog schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'reddog')
BEGIN
    EXEC('CREATE SCHEMA [reddog]');
    PRINT 'Created reddog schema';
END
GO

-- User billing accounts
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BillingAccounts' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[BillingAccounts] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UserOid NVARCHAR(100) NOT NULL UNIQUE,
        UserEmail NVARCHAR(255) NOT NULL,
        UserName NVARCHAR(255) NOT NULL DEFAULT '',
        Plan NVARCHAR(50) NOT NULL DEFAULT 'starter',
        Credits INT NOT NULL DEFAULT 0,
        Status NVARCHAR(50) NOT NULL DEFAULT 'active',
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_BillingAccounts_UserOid ON [reddog].[BillingAccounts] (UserOid);
    CREATE INDEX IX_BillingAccounts_Email ON [reddog].[BillingAccounts] (UserEmail);
    PRINT 'Created BillingAccounts table';
END
GO

-- Credit transactions
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CreditTransactions' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[CreditTransactions] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UserOid NVARCHAR(100) NOT NULL,
        Amount INT NOT NULL,
        Operation NVARCHAR(100) NOT NULL,
        BalanceBefore INT NOT NULL,
        BalanceAfter INT NOT NULL,
        Metadata NVARCHAR(MAX) NULL,
        Timestamp DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );

    CREATE INDEX IX_CreditTransactions_UserOid ON [reddog].[CreditTransactions] (UserOid);
    CREATE INDEX IX_CreditTransactions_Timestamp ON [reddog].[CreditTransactions] (Timestamp);
    PRINT 'Created CreditTransactions table';
END
GO

-- Subscriptions
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Subscriptions' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[Subscriptions] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UserOid NVARCHAR(100) NOT NULL,
        Plan NVARCHAR(50) NOT NULL,
        MonthlyCredits INT NOT NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'active',
        PaymentMethodId NVARCHAR(100) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        NextBillingAt DATETIME2 NOT NULL,
        CancelledAt DATETIME2 NULL,
        FOREIGN KEY (UserOid) REFERENCES [reddog].[BillingAccounts] (UserOid)
    );

    CREATE INDEX IX_Subscriptions_UserOid ON [reddog].[Subscriptions] (UserOid);
    CREATE INDEX IX_Subscriptions_NextBilling ON [reddog].[Subscriptions] (NextBillingAt);
    PRINT 'Created Subscriptions table';
END
GO

-- Insert some sample plans for reference
IF NOT EXISTS (SELECT * FROM [reddog].[BillingAccounts] WHERE UserOid = 'system-demo')
BEGIN
    INSERT INTO [reddog].[BillingAccounts] (UserOid, UserEmail, UserName, Plan, Credits)
    VALUES 
        ('system-demo', 'demo@zerosumagriculture.com.au', 'Demo User', 'starter', 1000),
        ('system-pro', 'pro@zerosumagriculture.com.au', 'Pro User', 'professional', 5000);
    
    PRINT 'Added demo billing accounts';
END
GO

PRINT '=== Red Dog Billing System Tables Created ===';
PRINT 'Schema: [reddog]';
PRINT 'Tables: BillingAccounts, CreditTransactions, Subscriptions';
PRINT 'Ready for Stripe integration and credit-based billing';
