-- ============================================
-- Create Data Approvals Table
-- ============================================
-- Tracks approval requests for provider data before storage
-- ============================================

USE zerosumag;
GO

-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'reddog')
BEGIN
    EXEC('CREATE SCHEMA reddog');
END
GO

-- Create DataApprovals table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DataApprovals' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[DataApprovals] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ApprovalId NVARCHAR(100) NOT NULL,
        RequestId NVARCHAR(100) NOT NULL,
        Provider NVARCHAR(100) NOT NULL,
        DataType NVARCHAR(100) NOT NULL,
        Status NVARCHAR(50) NOT NULL, -- pending, approved, denied, expired
        DataSize BIGINT NOT NULL,
        RecordCount INT NOT NULL,
        Metadata NVARCHAR(MAX),
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        ExpiresAt DATETIME2 NOT NULL,
        ProcessedBy NVARCHAR(100),
        ProcessedAt DATETIME2,
        DenialReason NVARCHAR(500),
        
        CONSTRAINT UQ_ApprovalId UNIQUE (ApprovalId)
    );
    
    -- Indexes for efficient searching
    CREATE INDEX IX_Status ON [reddog].[DataApprovals](Status);
    CREATE INDEX IX_Provider_DataType ON [reddog].[DataApprovals](Provider, DataType);
    CREATE INDEX IX_CreatedAt ON [reddog].[DataApprovals](CreatedAt DESC);
    
    PRINT 'Created table: reddog.DataApprovals';
END
ELSE
BEGIN
    PRINT 'Table reddog.DataApprovals already exists';
END
GO
