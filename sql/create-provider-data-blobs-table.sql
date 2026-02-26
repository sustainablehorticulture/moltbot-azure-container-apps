-- ============================================
-- Create Provider Data Blobs Table
-- ============================================
-- Tracks blob storage metadata for data retrieved from external providers
-- via Trevor Tractor authentication
-- ============================================

USE zerosumag;
GO

-- Create schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'reddog')
BEGIN
    EXEC('CREATE SCHEMA reddog');
END
GO

-- Create ProviderDataBlobs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProviderDataBlobs' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[ProviderDataBlobs] (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        BlobName NVARCHAR(500) NOT NULL,
        BlobUrl NVARCHAR(1000) NOT NULL,
        Provider NVARCHAR(100) NOT NULL,
        RequestId NVARCHAR(100) NOT NULL,
        DataType NVARCHAR(100) NOT NULL,
        ContentHash NVARCHAR(64) NOT NULL,
        SizeBytes BIGINT NOT NULL,
        Metadata NVARCHAR(MAX),
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        CONSTRAINT UQ_BlobName UNIQUE (BlobName)
    );
    
    -- Indexes for efficient searching
    CREATE INDEX IX_Provider_DataType ON [reddog].[ProviderDataBlobs](Provider, DataType);
    CREATE INDEX IX_RequestId ON [reddog].[ProviderDataBlobs](RequestId);
    CREATE INDEX IX_CreatedAt ON [reddog].[ProviderDataBlobs](CreatedAt DESC);
    
    PRINT 'Created table: reddog.ProviderDataBlobs';
END
ELSE
BEGIN
    PRINT 'Table reddog.ProviderDataBlobs already exists';
END
GO
