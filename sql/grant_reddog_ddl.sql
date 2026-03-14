-- Run this in Azure Portal → SQL databases → zerosumag → Query editor
-- Log in with your Azure AD account (CloudSA7680762c or your personal admin login)
-- This grants RedDogBot enough rights to create the Farm_Products tables

ALTER ROLE db_ddladmin ADD MEMBER [RedDogBot];
GO

-- Optionally also grant data read/write (should already be set, but just in case)
ALTER ROLE db_datareader ADD MEMBER [RedDogBot];
ALTER ROLE db_datawriter ADD MEMBER [RedDogBot];
GO
