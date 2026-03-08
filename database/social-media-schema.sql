-- Red Dog Social Media Integration Schema
-- Tables for storing OAuth tokens and social media authentication

USE zerosumag;
GO

-- OAuth state tokens for CSRF protection
CREATE TABLE [reddog].[OAuthStates] (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId NVARCHAR(255) NOT NULL,
    Platform NVARCHAR(50) NOT NULL,
    State NVARCHAR(255) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    ExpiresAt DATETIME2 NOT NULL,
    INDEX IX_OAuthStates_UserId_Platform (UserId, Platform),
    INDEX IX_OAuthStates_ExpiresAt (ExpiresAt)
);
GO

-- Social media access tokens
CREATE TABLE [reddog].[SocialMediaTokens] (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId NVARCHAR(255) NOT NULL,
    Platform NVARCHAR(50) NOT NULL,
    AccessToken NVARCHAR(MAX) NOT NULL,
    RefreshToken NVARCHAR(MAX) NULL,
    ExpiresAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_SocialMediaTokens_UserPlatform UNIQUE (UserId, Platform),
    INDEX IX_SocialMediaTokens_UserId (UserId)
);
GO

-- Social media post history
CREATE TABLE [reddog].[SocialMediaPosts] (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserId NVARCHAR(255) NOT NULL,
    Platform NVARCHAR(50) NOT NULL,
    PostId NVARCHAR(255) NOT NULL,
    Content NVARCHAR(MAX) NULL,
    MediaUrl NVARCHAR(MAX) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'published',
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    ScheduledFor DATETIME2 NULL,
    PublishedAt DATETIME2 NULL,
    INDEX IX_SocialMediaPosts_UserId (UserId),
    INDEX IX_SocialMediaPosts_Platform (Platform),
    INDEX IX_SocialMediaPosts_CreatedAt (CreatedAt)
);
GO

-- Cleanup old OAuth states (run periodically)
CREATE PROCEDURE [reddog].[CleanupExpiredOAuthStates]
AS
BEGIN
    DELETE FROM [reddog].[OAuthStates]
    WHERE ExpiresAt < GETUTCDATE();
END;
GO

PRINT 'Social media schema created successfully';
