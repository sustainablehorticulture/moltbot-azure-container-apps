-- ============================================================
-- IoT Infrastructure Table — zerosumag database
-- ============================================================
-- Written by Trevor (farm provisioning agent) when setting up
-- a new farm's APIM APIs and Key Vault.
--
-- Red Dog reads this table to discover which sensor API
-- providers are available for each farm, then queries APIM
-- accordingly for real-time data.
-- ============================================================

USE [zerosumag];
GO

CREATE TABLE [dbo].[IoT Infrastructure] (
    -- Primary key
    Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,

    -- Farm identifier — must match [dbo].[Site Overview].Name exactly
    FarmName        NVARCHAR(100) NOT NULL,

    -- Provider ID — must match a key in sensor-providers.json
    -- e.g. "selectronic", "wattwatchers", "pairtree", "the_things_network"
    ProviderId      NVARCHAR(50)  NOT NULL,

    -- Optional: override the APIM path for this provider at this farm
    -- Leave NULL to use the default apimPath from sensor-providers.json
    APIMPath        NVARCHAR(200) NULL,

    -- Optional: override the Key Vault name for this farm/provider
    -- Leave NULL to derive from FarmName (e.g. "Grassgum Farm" → "GrassgumFarm")
    KeyVaultName    NVARCHAR(100) NULL,

    -- Whether this provider is active for this farm
    Enabled         BIT           NOT NULL DEFAULT 1,

    -- Audit columns
    CreatedAt       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy       NVARCHAR(100) NULL,     -- e.g. "Trevor" or "manual"
    Notes           NVARCHAR(500) NULL,

    -- Unique constraint: one row per farm+provider
    CONSTRAINT UQ_IotInfra_FarmProvider UNIQUE (FarmName, ProviderId)
);
GO

-- Index for fast lookup by farm
CREATE NONCLUSTERED INDEX IX_IotInfra_FarmName
    ON [dbo].[IoT Infrastructure] (FarmName)
    INCLUDE (ProviderId, APIMPath, KeyVaultName, Enabled);
GO

-- ============================================================
-- Seed data — existing farms (matches sites.json)
-- Trevor will INSERT rows like these when provisioning a farm
-- ============================================================

INSERT INTO [dbo].[IoT Infrastructure]
    (FarmName, ProviderId, KeyVaultName, Enabled, CreatedBy, Notes)
VALUES
    ('Grassgum Farm', 'selectronic',      'GrassgumFarm', 1, 'Trevor', 'SP PRO inverter, site ID 3501'),
    ('Grassgum Farm', 'wattwatchers',     'GrassgumFarm', 1, 'Trevor', 'Circuit-level energy monitoring'),
    ('Grassgum Farm', 'pairtree',         'GrassgumFarm', 1, 'Trevor', 'Soil, rainfall, tank level sensors'),
    ('Zerosum Ag',    'pairtree',         'Zerosumag',    1, 'Trevor', 'Horticulture IoT sensors'),
    ('Zerosum Ag',    'the_things_network','Zerosumag',   1, 'Trevor', 'LoRaWAN devices via TTN, app: grassgumfarm');
GO

-- ============================================================
-- Trevor INSERT template — use when provisioning a new farm
-- ============================================================
--
-- INSERT INTO [dbo].[IoT Infrastructure]
--     (FarmName, ProviderId, APIMPath, KeyVaultName, Enabled, CreatedBy, Notes)
-- VALUES
--     ('<FarmName>', '<providerId>', NULL, '<FarmNamePascalCase>', 1, 'Trevor', '<description>');
--
-- After inserting, Red Dog will pick up the new provider automatically
-- within 5 minutes (cache TTL). No code changes required.
-- ============================================================
