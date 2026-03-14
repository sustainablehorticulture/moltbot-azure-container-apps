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

const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');
const crypto = require('crypto');

class BlobStorageManager {
    constructor({ db, connectionString, containerName = 'provider-data' }) {
        this.db = db;
        this.connectionString = connectionString || process.env.AZURE_STORAGE_CONNECTION_STRING;
        this.defaultContainerName = containerName;
        this.currentContainerName = containerName;
        this.blobServiceClient = null;
        this.containerClient = null;
        this.containerClients = new Map(); // Cache for multiple container clients
        this.isConnected = false;
    }

    async connect() {
        if (!this.connectionString) {
            console.log('[BlobStorage] No connection string provided, blob storage disabled');
            return false;
        }

        try {
            this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
            this.containerClient = this.blobServiceClient.getContainerClient(this.currentContainerName);
            
            // Create default container if it doesn't exist
            await this.containerClient.createIfNotExists();
            
            // Cache the default container client
            this.containerClients.set(this.currentContainerName, this.containerClient);
            
            this.isConnected = true;
            console.log(`[BlobStorage] Connected to storage account with default container: ${this.currentContainerName}`);
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
     * List farm media images (drone, cam, field photos) from a storage container
     * and generate 24-hour SAS URLs that social platforms can load publicly.
     *
     * @param {string} container  - Container name (default: 'farm-media')
     * @param {string} prefix     - Optional blob prefix filter (e.g. 'drone/', 'cam/')
     * @param {number} maxResults - Max images to return (default 20)
     * @returns {Array} [{ name, url, sasUrl, contentType, size, lastModified }]
     */
    async getFarmMedia(container = 'farm-media', prefix = '', maxResults = 20) {
        if (!this.isConnected) throw new Error('Blob storage not connected');

        const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'];

        const client = await this.getContainerClient(container);
        if (!client) {
            console.warn(`[BlobStorage] Container '${container}' not found — no farm media available`);
            return [];
        }

        const results = [];
        for await (const blob of client.listBlobsFlat({ prefix, includeMetadata: true })) {
            if (results.length >= maxResults) break;
            const ext = blob.name.slice(blob.name.lastIndexOf('.')).toLowerCase();
            if (!IMAGE_EXTS.includes(ext)) continue;

            const blobClient = client.getBlockBlobClient(blob.name);
            let sasUrl = null;

            try {
                sasUrl = await blobClient.generateSasUrl({
                    permissions:  BlobSASPermissions.parse('r'),
                    startsOn:     new Date(),
                    expiresOn:    new Date(Date.now() + 24 * 60 * 60 * 1000)
                });
            } catch {
                sasUrl = blobClient.url;
            }

            results.push({
                name:         blob.name,
                url:          blobClient.url,
                sasUrl,
                contentType:  blob.properties.contentType || `image/${ext.slice(1)}`,
                size:         blob.properties.contentLength,
                lastModified: blob.properties.lastModified,
                metadata:     blob.metadata || {}
            });
        }

        return results;
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
     * List all containers in the storage account
     * @returns {Array} List of container names
     */
    async listContainers() {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const containers = [];
            for await (const container of this.blobServiceClient.listContainers()) {
                containers.push({
                    name: container.name,
                    properties: container.properties,
                    metadata: container.metadata
                });
            }
            
            console.log(`[BlobStorage] Found ${containers.length} containers`);
            return containers;
        } catch (err) {
            console.error(`[BlobStorage] Failed to list containers: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get or create a container client for a specific container
     * @param {string} containerName - Name of the container
     * @returns {ContainerClient} Container client instance
     */
    async getContainerClient(containerName) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        // Return cached client if available
        if (this.containerClients.has(containerName)) {
            return this.containerClients.get(containerName);
        }

        try {
            const client = this.blobServiceClient.getContainerClient(containerName);
            
            // Check if container exists
            const exists = await client.exists();
            if (!exists) {
                console.log(`[BlobStorage] Container '${containerName}' does not exist`);
                return null;
            }
            
            // Cache the client
            this.containerClients.set(containerName, client);
            console.log(`[BlobStorage] Connected to container: ${containerName}`);
            return client;
        } catch (err) {
            console.error(`[BlobStorage] Failed to get container client for '${containerName}': ${err.message}`);
            throw err;
        }
    }

    /**
     * Switch the current active container
     * @param {string} containerName - Name of the container to switch to
     * @returns {boolean} Success status
     */
    async switchContainer(containerName) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const client = await this.getContainerClient(containerName);
            if (!client) {
                throw new Error(`Container '${containerName}' not found`);
            }
            
            this.containerClient = client;
            this.currentContainerName = containerName;
            console.log(`[BlobStorage] Switched to container: ${containerName}`);
            return true;
        } catch (err) {
            console.error(`[BlobStorage] Failed to switch container: ${err.message}`);
            throw err;
        }
    }

    /**
     * List blobs in a specific container
     * @param {string} containerName - Container to list blobs from (optional, uses current if not specified)
     * @param {string} prefix - Blob name prefix filter (optional)
     * @returns {Array} List of blobs
     */
    async listBlobsInContainer(containerName = null, prefix = '') {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            let client;
            if (containerName) {
                client = await this.getContainerClient(containerName);
                if (!client) {
                    throw new Error(`Container '${containerName}' not found`);
                }
            } else {
                client = this.containerClient;
                containerName = this.currentContainerName;
            }
            
            const blobs = [];
            for await (const blob of client.listBlobsFlat({ prefix })) {
                blobs.push({
                    container: containerName,
                    name: blob.name,
                    properties: blob.properties,
                    metadata: blob.metadata
                });
            }
            
            console.log(`[BlobStorage] Found ${blobs.length} blobs in container '${containerName}'`);
            return blobs;
        } catch (err) {
            console.error(`[BlobStorage] Failed to list blobs in container: ${err.message}`);
            throw err;
        }
    }

    /**
     * Read a blob from a specific container
     * @param {string} containerName - Container name
     * @param {string} blobName - Blob name
     * @returns {Object} Blob content
     */
    async readBlobFromContainer(containerName, blobName) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const client = await this.getContainerClient(containerName);
            if (!client) {
                throw new Error(`Container '${containerName}' not found`);
            }
            
            const blockBlobClient = client.getBlockBlobClient(blobName);
            const downloadResponse = await blockBlobClient.download(0);
            const content = await this.streamToString(downloadResponse.readableStreamBody);
            
            // Try to parse as JSON, otherwise return as string
            try {
                return JSON.parse(content);
            } catch {
                return content;
            }
        } catch (err) {
            console.error(`[BlobStorage] Failed to read blob '${blobName}' from container '${containerName}': ${err.message}`);
            throw err;
        }
    }

    /**
     * Search blobs across all containers
     * @param {Object} criteria - Search criteria
     * @param {string} criteria.containerName - Filter by container (optional)
     * @param {string} criteria.prefix - Blob name prefix (optional)
     * @param {number} criteria.maxResults - Maximum results to return (optional)
     * @returns {Array} List of blobs matching criteria
     */
    async searchAllContainers({ containerName = null, prefix = '', maxResults = 100 } = {}) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            let containersToSearch = [];
            
            if (containerName) {
                // Search specific container
                containersToSearch = [{ name: containerName }];
            } else {
                // Search all containers
                containersToSearch = await this.listContainers();
            }
            
            const allBlobs = [];
            
            for (const container of containersToSearch) {
                try {
                    const blobs = await this.listBlobsInContainer(container.name, prefix);
                    allBlobs.push(...blobs);
                    
                    if (allBlobs.length >= maxResults) {
                        break;
                    }
                } catch (err) {
                    console.warn(`[BlobStorage] Failed to search container '${container.name}': ${err.message}`);
                    // Continue with other containers
                }
            }
            
            return allBlobs.slice(0, maxResults);
        } catch (err) {
            console.error(`[BlobStorage] Failed to search containers: ${err.message}`);
            throw err;
        }
    }

    /**
     * Save chat conversation history to blob storage
     * @param {string} farmId - Farm identifier (e.g., 'grassgum', 'pairtree')
     * @param {string} userId - User identifier
     * @param {Array} messages - Array of chat messages
     * @param {Object} metadata - Additional session metadata
     * @returns {Object} Blob info
     */
    async saveChatHistory({ farmId, userId, messages, metadata = {} }) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            // Use a dedicated container for chat history
            const chatContainer = 'chat-history';
            let client = await this.getContainerClient(chatContainer);
            
            // Create container if it doesn't exist
            if (!client) {
                const newClient = this.blobServiceClient.getContainerClient(chatContainer);
                await newClient.createIfNotExists();
                this.containerClients.set(chatContainer, newClient);
                client = newClient;
            }
            
            // Generate blob name: farm/user/session_timestamp.json
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sessionId = metadata.sessionId || `session-${Date.now()}`;
            const blobName = `${farmId}/${userId}/${sessionId}.json`;
            
            const blockBlobClient = client.getBlockBlobClient(blobName);
            
            const chatData = {
                farmId,
                userId,
                sessionId,
                timestamp: new Date().toISOString(),
                messageCount: messages.length,
                messages,
                metadata
            };
            
            const content = JSON.stringify(chatData, null, 2);
            
            await blockBlobClient.upload(content, content.length, {
                blobHTTPHeaders: {
                    blobContentType: 'application/json'
                },
                metadata: {
                    farmId,
                    userId,
                    sessionId,
                    messageCount: messages.length.toString()
                }
            });
            
            console.log(`[BlobStorage] Saved chat history: ${blobName} (${messages.length} messages)`);
            
            return {
                blobName,
                sessionId,
                messageCount: messages.length,
                timestamp: chatData.timestamp
            };
        } catch (err) {
            console.error(`[BlobStorage] Failed to save chat history: ${err.message}`);
            throw err;
        }
    }

    /**
     * Load the most recent chat history for a farm/user
     * @param {string} farmId - Farm identifier
     * @param {string} userId - User identifier
     * @param {number} maxMessages - Maximum messages to return (default: 50)
     * @returns {Array} Chat messages
     */
    async loadChatHistory({ farmId, userId, maxMessages = 50 }) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const chatContainer = 'chat-history';
            const client = await this.getContainerClient(chatContainer);
            
            if (!client) {
                console.log('[BlobStorage] No chat history container found');
                return [];
            }
            
            // List all chat sessions for this farm/user
            const prefix = `${farmId}/${userId}/`;
            const sessions = [];
            
            for await (const blob of client.listBlobsFlat({ prefix })) {
                sessions.push({
                    name: blob.name,
                    lastModified: blob.properties.lastModified
                });
            }
            
            if (sessions.length === 0) {
                console.log(`[BlobStorage] No chat history found for ${farmId}/${userId}`);
                return [];
            }
            
            // Sort by last modified (most recent first)
            sessions.sort((a, b) => b.lastModified - a.lastModified);
            
            // Load the most recent session
            const mostRecent = sessions[0];
            const blockBlobClient = client.getBlockBlobClient(mostRecent.name);
            const downloadResponse = await blockBlobClient.download(0);
            const content = await this.streamToString(downloadResponse.readableStreamBody);
            const chatData = JSON.parse(content);
            
            console.log(`[BlobStorage] Loaded chat history: ${mostRecent.name} (${chatData.messages.length} messages)`);
            
            // Return the most recent messages up to maxMessages
            return chatData.messages.slice(-maxMessages);
        } catch (err) {
            console.error(`[BlobStorage] Failed to load chat history: ${err.message}`);
            return []; // Return empty array on error, don't break the chat
        }
    }

    /**
     * List all chat sessions for a farm
     * @param {string} farmId - Farm identifier
     * @param {string} userId - User identifier (optional)
     * @returns {Array} List of chat sessions
     */
    async listChatSessions({ farmId, userId = null }) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const chatContainer = 'chat-history';
            const client = await this.getContainerClient(chatContainer);
            
            if (!client) {
                return [];
            }
            
            const prefix = userId ? `${farmId}/${userId}/` : `${farmId}/`;
            const sessions = [];
            
            for await (const blob of client.listBlobsFlat({ prefix })) {
                sessions.push({
                    name: blob.name,
                    farmId,
                    userId: blob.name.split('/')[1],
                    sessionId: blob.name.split('/')[2].replace('.json', ''),
                    lastModified: blob.properties.lastModified,
                    size: blob.properties.contentLength,
                    messageCount: blob.metadata?.messageCount || 'unknown'
                });
            }
            
            // Sort by last modified (most recent first)
            sessions.sort((a, b) => b.lastModified - a.lastModified);
            
            console.log(`[BlobStorage] Found ${sessions.length} chat sessions for ${farmId}`);
            return sessions;
        } catch (err) {
            console.error(`[BlobStorage] Failed to list chat sessions: ${err.message}`);
            throw err;
        }
    }

    /**
     * Delete old chat sessions (cleanup)
     * @param {string} farmId - Farm identifier
     * @param {number} daysToKeep - Keep sessions from last N days (default: 90)
     * @returns {number} Number of sessions deleted
     */
    async cleanupOldChatSessions({ farmId, daysToKeep = 90 }) {
        if (!this.isConnected) {
            throw new Error('Blob storage not connected');
        }

        try {
            const chatContainer = 'chat-history';
            const client = await this.getContainerClient(chatContainer);
            
            if (!client) {
                return 0;
            }
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            const prefix = `${farmId}/`;
            let deletedCount = 0;
            
            for await (const blob of client.listBlobsFlat({ prefix })) {
                if (blob.properties.lastModified < cutoffDate) {
                    const blockBlobClient = client.getBlockBlobClient(blob.name);
                    await blockBlobClient.delete();
                    deletedCount++;
                }
            }
            
            console.log(`[BlobStorage] Cleaned up ${deletedCount} old chat sessions for ${farmId}`);
            return deletedCount;
        } catch (err) {
            console.error(`[BlobStorage] Failed to cleanup chat sessions: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get storage status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            currentContainer: this.currentContainerName,
            defaultContainer: this.defaultContainerName,
            cachedContainers: Array.from(this.containerClients.keys()),
            hasConnectionString: !!this.connectionString
        };
    }
}

module.exports = BlobStorageManager;
