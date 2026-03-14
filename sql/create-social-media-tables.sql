-- Create social media OAuth tables for Red Dog
-- Run this as db_owner on zerosumag database

-- Create reddog schema if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'reddog')
BEGIN
    EXEC('CREATE SCHEMA [reddog]');
    PRINT 'Created reddog schema';
END
GO

-- OAuth state storage (temporary, 10-minute window for CSRF protection)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OAuthStates' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[OAuthStates] (
        Id         INT IDENTITY(1,1) PRIMARY KEY,
        UserId     NVARCHAR(255) NOT NULL,
        Platform   NVARCHAR(50)  NOT NULL,
        State      NVARCHAR(500) NOT NULL UNIQUE,
        CreatedAt  DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        ExpiresAt  DATETIME2     NOT NULL
    );

    CREATE INDEX IX_OAuthStates_UserId   ON [reddog].[OAuthStates] (UserId);
    CREATE INDEX IX_OAuthStates_State    ON [reddog].[OAuthStates] (State);
    CREATE INDEX IX_OAuthStates_Expires  ON [reddog].[OAuthStates] (ExpiresAt);
    PRINT 'Created OAuthStates table';
END
GO

-- Social media access/refresh token storage
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SocialMediaTokens' AND schema_id = SCHEMA_ID('reddog'))
BEGIN
    CREATE TABLE [reddog].[SocialMediaTokens] (
        Id           INT IDENTITY(1,1) PRIMARY KEY,
        UserId       NVARCHAR(255) NOT NULL,
        Platform     NVARCHAR(50)  NOT NULL,
        AccessToken  NVARCHAR(MAX) NOT NULL,
        RefreshToken NVARCHAR(MAX) NULL,
        ExpiresAt    DATETIME2     NULL,
        CreatedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT UQ_SocialMediaTokens_UserPlatform UNIQUE (UserId, Platform)
    );

    CREATE INDEX IX_SocialMediaTokens_UserId   ON [reddog].[SocialMediaTokens] (UserId);
    CREATE INDEX IX_SocialMediaTokens_Platform ON [reddog].[SocialMediaTokens] (Platform);
    PRINT 'Created SocialMediaTokens table';
END
GO

PRINT '=== Red Dog Social Media Tables Created ===';
PRINT 'Tables: OAuthStates, SocialMediaTokens';
