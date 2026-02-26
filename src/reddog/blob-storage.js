/**
 * Red Dog Blob Storage Manager
 * 
 * Handles Azure Blob Storage operations for storing and retrieving data
 * from external providers authenticated through Trevor Tractor.
 * 
 * Features:
 * - Write data received from external providers (via Trevor)
 * - Read stored data for chat interface queries
 * - Organize blobs by provider and request metadata
 * - Track blob metadata in SQL database
 */

const { BlobServiceClient } = require('@azure/storage-blob');
const crypto = require('crypto');

class BlobStorageManager {
    constructor({ db, connectionString, containerName = 'provider-data' }) {
        this.db = db;
        this.connectionString = connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
        this.containerName = containerName;
        this.blobServiceClient = null;
        this.containerClient = null;
        this.isConnected = false;
    }

    async connect() {
        if (!this.connectionString) {
            console.log('[BlobStorage] No connection string provided, blob storage disabled');
            return false;
        }

        try {
            this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            
            // Create container if it doesn't exist
            await this.containerClient.createIfNotExists({
                access: 'private'
            });
            
            this.isConnected = true;
            console.log(`[BlobStorage] Connected to container: ${this.containerName}`);
            return true;
        } catch (err) {
            console.error(`[BlobStorage] Failed to connect: ${err.message}`);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Write data from external provider to blob storage
     * Called when Trevor authenticates and retrieves data from a provider
     * 
     * @param {Object} params
     * @param {string} params.provider - Provider name (e.g., 'axistech', 'pairtree', 'aadx')
     * @param {string} params.requestId - Unique request ID from Trevor
     * @param {string} params.dataType - Type of data (e.g., 'iot', 'weather', 'soil')
     * @param {Object} params.data - The actual data to store
     * @param {Object} params.metadata - Additional metadata (user, timestamp, etc.)
     * @returns {Object} Blob info with URL and metadata
     */
    async writeProviderData({ provider, requestId, dataType, data, metadata = {} }) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            // Generate blob name: provider/dataType/requestId_timestamp.json
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const blobName = `${provider}/${dataType}/${requestId}_${timestamp}.json`;
            
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Prepare data with metadata wrapper
            const blobContent = {
                provider,
                requestId,
                dataType,
                timestamp: new Date().toISOString(),
                metadata,
                data
            };
            
            const content = JSON.stringify(blobContent, null, 2);
            const contentHash = crypto.createHash('sha256').update(content).digest('hex');
            
            // Upload blob
            await blockBlobClient.upload(content, content.length, {
                blobHTTPHeaders: {
                    blobContentType: 'application/json'
                },
                metadata: {
                    provider,
                    requestId,
                    dataType,
                    contentHash,
                    ...metadata
                }
            });
            
            const blobUrl = blockBlobClient.url;
            
            console.log(`[BlobStorage] Wrote provider data: ${blobName}`);
            
            // Track in database
            await this.trackBlobInDatabase({
                blobName,
                blobUrl,
                provider,
                requestId,
                dataType,
                contentHash,
                sizeBytes: content.length,
                metadata
            });
            
            return {
                blobName,
                blobUrl,
                provider,
                requestId,
                dataType,
                contentHash,
                timestamp: blobContent.timestamp
            };
        } catch (err) {
            console.error(`[BlobStorage] Failed to write provider data: ${err.message}`);
            throw err;
        }
    }

    /**
     * Read provider data from blob storage
     * Called when user queries data through chat interface
     * 
     * @param {string} blobName - Name of the blob to read
     * @returns {Object} The stored data
     */
    async readProviderData(blobName) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            const downloadResponse = await blockBlobClient.download(0);
            const content = await this.streamToString(downloadResponse.readableStreamBody);
            
            const blobContent = JSON.parse(content);
            
            console.log(`[BlobStorage] Read provider data: ${blobName}`);
            
            return blobContent;
        } catch (err) {
            console.error(`[BlobStorage] Failed to read provider data: ${err.message}`);
            throw err;
        }
    }

    /**
     * List blobs by provider and/or data type
     * 
     * @param {Object} filters
     * @param {string} filters.provider - Filter by provider
     * @param {string} filters.dataType - Filter by data type
     * @param {string} filters.requestId - Filter by request ID
     * @returns {Array} List of blob metadata
     */
    async listProviderData({ provider, dataType, requestId } = {}) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            let prefix = '';
            if (provider && dataType) {
                prefix = `${provider}/${dataType}/`;
            } else if (provider) {
                prefix = `${provider}/`;
            }
            
            const blobs = [];
            for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
                // Filter by requestId if provided
                if (requestId && !blob.name.includes(requestId)) {
                    continue;
                }
                
                blobs.push({
                    name: blob.name,
                    properties: blob.properties,
                    metadata: blob.metadata
                });
            }
            
            return blobs;
        } catch (err) {
            console.error(`[BlobStorage] Failed to list provider data: ${err.message}`);
            throw err;
        }
    }

    /**
     * Search for provider data in database
     * Returns blob references that can be read
     * 
     * @param {Object} criteria
     * @param {string} criteria.provider - Provider name
     * @param {string} criteria.dataType - Data type
     * @param {Date} criteria.startDate - Start date filter
     * @param {Date} criteria.endDate - End date filter
     * @returns {Array} List of blob records from database
     */
    async searchProviderData({ provider, dataType, startDate, endDate } = {}) {
        if (!this.db || !this.db.isConnected) {
            console.log('[BlobStorage] Database not connected, using blob listing');
            return await this.listProviderData({ provider, dataType });
        }

        try {
            let query = 'SELECT * FROM [reddog].[ProviderDataBlobs] WHERE 1=1';
            const params = [];
            
            if (provider) {
                query += ' AND Provider = @Provider';
                params.push({ name: 'Provider', value: provider });
            }
            
            if (dataType) {
                query += ' AND DataType = @DataType';
                params.push({ name: 'DataType', value: dataType });
            }
            
            if (startDate) {
                query += ' AND CreatedAt >= @StartDate';
                params.push({ name: 'StartDate', value: startDate });
            }
            
            if (endDate) {
                query += ' AND CreatedAt <= @EndDate';
                params.push({ name: 'EndDate', value: endDate });
            }
            
            query += ' ORDER BY CreatedAt DESC';
            
            const results = await this.db.query(query, params, 'zerosumag');
            return results;
        } catch (err) {
            console.error(`[BlobStorage] Failed to search provider data: ${err.message}`);
            throw err;
        }
    }

    /**
     * Track blob metadata in database for efficient searching
     */
    async trackBlobInDatabase({ blobName, blobUrl, provider, requestId, dataType, contentHash, sizeBytes, metadata }) {
        if (!this.db || !this.db.isConnected) {
            console.log('[BlobStorage] Database not connected, skipping blob tracking');
            return;
        }

        try {
            await this.db.query(`
                INSERT INTO [reddog].[ProviderDataBlobs]
                (BlobName, BlobUrl, Provider, RequestId, DataType, ContentHash, SizeBytes, Metadata, CreatedAt)
                VALUES (@BlobName, @BlobUrl, @Provider, @RequestId, @DataType, @ContentHash, @SizeBytes, @Metadata, GETUTCDATE())
            `, [
                { name: 'BlobName', value: blobName },
                { name: 'BlobUrl', value: blobUrl },
                { name: 'Provider', value: provider },
                { name: 'RequestId', value: requestId },
                { name: 'DataType', value: dataType },
                { name: 'ContentHash', value: contentHash },
                { name: 'SizeBytes', value: sizeBytes },
                { name: 'Metadata', value: JSON.stringify(metadata) }
            ], 'zerosumag');
            
            console.log(`[BlobStorage] Tracked blob in database: ${blobName}`);
        } catch (err) {
            console.error(`[BlobStorage] Failed to track blob in database: ${err.message}`);
            // Don't throw - blob is still stored, just not tracked in DB
        }
    }

    /**
     * Helper to convert stream to string
     */
    async streamToString(readableStream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on('data', (data) => {
                chunks.push(data.toString());
            });
            readableStream.on('end', () => {
                resolve(chunks.join(''));
            });
            readableStream.on('error', reject);
        });
    }

    /**
     * Get storage status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            containerName: this.containerName,
            hasConnectionString: !!this.connectionString
        };
    }
}

module.exports = BlobStorageManager;
