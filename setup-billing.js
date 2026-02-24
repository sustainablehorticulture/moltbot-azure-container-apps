require('dotenv').config();
const sql = require('mssql');

async function setupBillingTables() {
    try {
        // Parse connection string
        const connStr = process.env.DATABASE_CONNECTION_STRING;
        const config = {
            server: 'zerosumag.database.windows.net',
            user: 'RedDogBot',
            password: 'Grassgum1806#',
            database: 'zerosumag',
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };

        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Check if schema exists
        const schemaCheck = await pool.request().query("SELECT * FROM sys.schemas WHERE name = 'reddog'");
        if (schemaCheck.recordset.length === 0) {
            console.log('❌ Schema [reddog] does not exist and RedDogBot lacks CREATE SCHEMA permission');
            console.log('Please create the schema manually with an admin account:');
            console.log("EXEC('CREATE SCHEMA [reddog]');");
            return;
        }
        console.log('✓ Schema [reddog] exists');

        // Create BillingAccounts table
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BillingAccounts' AND schema_id = SCHEMA_ID('reddog'))
            BEGIN
                CREATE TABLE [reddog].[BillingAccounts] (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    UserOid NVARCHAR(100) NOT NULL UNIQUE,
                    UserEmail NVARCHAR(255) NOT NULL,
                    UserName NVARCHAR(255) NOT NULL DEFAULT '',
                    [Plan] NVARCHAR(50) NOT NULL DEFAULT 'starter',
                    Credits INT NOT NULL DEFAULT 0,
                    Status NVARCHAR(50) NOT NULL DEFAULT 'active',
                    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
                    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
                );

                CREATE INDEX IX_BillingAccounts_UserOid ON [reddog].[BillingAccounts] (UserOid);
                CREATE INDEX IX_BillingAccounts_Email ON [reddog].[BillingAccounts] (UserEmail);
                PRINT 'Created BillingAccounts table';
            END
        `);
        console.log('✓ Created BillingAccounts table');

        // Create CreditTransactions table
        await pool.request().query(`
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
        `);
        console.log('✓ Created CreditTransactions table');

        // Create Subscriptions table
        await pool.request().query(`
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
        `);
        console.log('✓ Created Subscriptions table');

        // Insert demo accounts
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM [reddog].[BillingAccounts] WHERE UserOid = 'system-demo')
            BEGIN
                INSERT INTO [reddog].[BillingAccounts] (UserOid, UserEmail, UserName, Plan, Credits)
                VALUES 
                    ('system-demo', 'demo@zerosumagriculture.com.au', 'Demo User', 'starter', 1000),
                    ('system-pro', 'pro@zerosumagriculture.com.au', 'Pro User', 'professional', 5000);
                
                PRINT 'Added demo billing accounts';
            END
        `);
        console.log('✓ Added demo accounts');

        console.log('\n🎉 Billing tables setup complete!');
        console.log('Schema: [reddog]');
        console.log('Tables: BillingAccounts, CreditTransactions, Subscriptions');
        console.log('Demo accounts: system-demo (1000 credits), system-pro (5000 credits)');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    } finally {
        await sql.close();
    }
}

setupBillingTables();
