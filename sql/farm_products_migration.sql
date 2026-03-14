-- ============================================================
-- Farm Products + Check-In Log tables for zerosumag database
-- Run once against [zerosumag] database
-- ============================================================

USE [zerosumag];
GO

-- ── Farm_Products ─────────────────────────────────────────────────────────────
-- Master product catalog. Synced from dashboard Product Check-In form.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Farm_Products')
BEGIN
    CREATE TABLE [dbo].[Farm_Products] (
        [id]          NVARCHAR(64)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(128)   NOT NULL,
        [category]    NVARCHAR(64)    NOT NULL,
        [unit]        NVARCHAR(32)    NOT NULL,
        [price]       DECIMAL(10,2)   NOT NULL DEFAULT 0,
        [stock]       DECIMAL(10,2)   NOT NULL DEFAULT 0,
        [barcode]     NVARCHAR(64)    NULL,
        [available]   BIT             NOT NULL DEFAULT 1,
        [updated_at]  DATETIME2       NOT NULL DEFAULT GETUTCDATE()
    );

    -- Seed with known product catalog
    INSERT INTO [dbo].[Farm_Products] ([id], [name], [category], [unit], [price], [stock], [barcode])
    VALUES
        ('fresh-chillies',        'Fresh Chillies',        'Produce', 'kg',     12.50,  45,  '9300675024235'),
        ('blue-corn',             'Blue Corn',             'Grain',   'kg',      8.00, 120,  '9300675024242'),
        ('white-corn',            'White Corn',            'Grain',   'kg',      6.50, 200,  '9300675024259'),
        ('sweet-corn',            'Sweet Corn',            'Produce', 'dozen',  15.00,  80,  '9300675024266'),
        ('blood-orange',          'Blood Orange',          'Citrus',  'kg',      9.00, 150,  '9300675024273'),
        ('lemon',                 'Lemon',                 'Citrus',  'kg',      5.50, 200,  '9300675024280'),
        ('red-grapefruit',        'Red Grapefruit',        'Citrus',  'kg',      7.00,  90,  '9300675024297'),
        ('lime',                  'Lime',                  'Citrus',  'kg',      8.50, 110,  '9300675024303'),
        ('oranges',               'Oranges',               'Citrus',  'kg',      4.50, 300,  '9300675024310'),
        ('sides-of-lamb',         'Sides of Lamb',         'Meat',    'side',  180.00,  12,  '9300675024327'),
        ('sides-of-beef',         'Sides of Beef',         'Meat',    'side',  450.00,   8,  '9300675024334'),
        ('ethanol',               'Ethanol',               'Biofuel', 'L',       2.80, 500,  '9300675024341'),
        ('grassgum-agave-spirit', 'Grassgum Agave Spirit', 'Spirit',  'bottle', 85.00,  60,  '9300675024358'),
        ('carbon-credits',        'Carbon Credits',        'Credits', 'tonne',  35.00,   0,  NULL),
        ('biodiversity-credits',  'Biodiversity Credits',  'Credits', 'unit',  120.00,   0,  NULL);

    PRINT 'Created and seeded Farm_Products table';
END
ELSE
    PRINT 'Farm_Products already exists — skipping';
GO

-- ── Product_CheckIn_Log ───────────────────────────────────────────────────────
-- Persists every check-in from the dashboard Product Check-In form.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Product_CheckIn_Log')
BEGIN
    CREATE TABLE [dbo].[Product_CheckIn_Log] (
        [id]           INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
        [productId]    NVARCHAR(64)    NOT NULL,
        [productName]  NVARCHAR(128)   NOT NULL,
        [category]     NVARCHAR(64)    NULL,
        [quantity]     DECIMAL(10,2)   NOT NULL,
        [unit]         NVARCHAR(32)    NULL,
        [method]       NVARCHAR(32)    NULL,   -- barcode | weight | manual
        [barcode]      NVARCHAR(64)    NULL,
        [weight]       NVARCHAR(32)    NULL,
        [notes]        NVARCHAR(512)   NULL,
        [checkedInBy]  NVARCHAR(128)   NULL,
        [timestamp]    DATETIME2       NOT NULL DEFAULT GETUTCDATE()
    );
    PRINT 'Created Product_CheckIn_Log table';
END
ELSE
    PRINT 'Product_CheckIn_Log already exists — skipping';
GO

-- ── Stored proc: upsert stock after check-in ──────────────────────────────────

CREATE OR ALTER PROCEDURE [dbo].[sp_ProductCheckIn]
    @productId   NVARCHAR(64),
    @productName NVARCHAR(128),
    @category    NVARCHAR(64),
    @quantity    DECIMAL(10,2),
    @unit        NVARCHAR(32),
    @method      NVARCHAR(32),
    @barcode     NVARCHAR(64) = NULL,
    @weight      NVARCHAR(32) = NULL,
    @notes       NVARCHAR(512) = NULL,
    @checkedInBy NVARCHAR(128) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Insert log entry
    INSERT INTO [dbo].[Product_CheckIn_Log]
        ([productId],[productName],[category],[quantity],[unit],[method],[barcode],[weight],[notes],[checkedInBy])
    VALUES
        (@productId,@productName,@category,@quantity,@unit,@method,@barcode,@weight,@notes,@checkedInBy);

    -- Update master stock (upsert)
    IF EXISTS (SELECT 1 FROM [dbo].[Farm_Products] WHERE id = @productId)
    BEGIN
        UPDATE [dbo].[Farm_Products]
        SET stock = stock + @quantity, updated_at = GETUTCDATE()
        WHERE id = @productId;
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[Farm_Products] ([id],[name],[category],[unit],[stock],[updated_at])
        VALUES (@productId, @productName, @category, @unit, @quantity, GETUTCDATE());
    END

    -- Return updated product
    SELECT id, name, stock, unit, price FROM [dbo].[Farm_Products] WHERE id = @productId;
END;
GO

PRINT 'Migration complete.';
GO
