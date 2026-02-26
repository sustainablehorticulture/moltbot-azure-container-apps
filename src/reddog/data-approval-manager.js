/**
 * Red Dog Data Approval Manager
 * 
 * Manages approval workflow for incoming provider data from Trevor Tractor.
 * Data is queued for approval before being stored in blob storage.
 */

class DataApprovalManager {
    constructor({ db }) {
        this.db = db;
        this.pendingApprovals = new Map(); // requestId -> approval data
        this.approvalTimeout = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Queue provider data for approval
     * 
     * @param {Object} data - Provider data from Trevor
     * @returns {Object} Approval request info
     */
    async queueForApproval(data) {
        const approvalId = this.generateApprovalId();
        
        const approvalRequest = {
            approvalId,
            requestId: data.requestId,
            provider: data.provider,
            dataType: data.dataType,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.approvalTimeout).toISOString(),
            status: 'pending',
            data: data.payload,
            metadata: {
                trevorRequestId: data.trevorRequestId,
                authenticatedUser: data.user,
                retrievedAt: data.timestamp,
                dataSize: JSON.stringify(data.payload).length,
                recordCount: this.estimateRecordCount(data.payload)
            }
        };
        
        // Store in memory
        this.pendingApprovals.set(approvalId, approvalRequest);
        
        // Track in database if available
        if (this.db && this.db.isConnected) {
            await this.trackApprovalInDatabase(approvalRequest);
        }
        
        console.log(`[DataApproval] Queued for approval: ${approvalId} (${data.provider}/${data.dataType})`);
        
        return {
            approvalId,
            provider: data.provider,
            dataType: data.dataType,
            recordCount: approvalRequest.metadata.recordCount,
            dataSize: approvalRequest.metadata.dataSize,
            expiresAt: approvalRequest.expiresAt
        };
    }

    /**
     * Approve pending data and return it for storage
     * 
     * @param {string} approvalId - Approval ID
     * @param {string} approvedBy - User who approved
     * @returns {Object} Approved data ready for storage
     */
    async approve(approvalId, approvedBy = 'system') {
        const approval = this.pendingApprovals.get(approvalId);
        
        if (!approval) {
            throw new Error(`Approval request not found: ${approvalId}`);
        }
        
        if (approval.status !== 'pending') {
            throw new Error(`Approval already processed: ${approval.status}`);
        }
        
        // Check if expired
        if (new Date() > new Date(approval.expiresAt)) {
            approval.status = 'expired';
            await this.updateApprovalStatus(approvalId, 'expired');
            throw new Error(`Approval request expired: ${approvalId}`);
        }
        
        // Mark as approved
        approval.status = 'approved';
        approval.approvedBy = approvedBy;
        approval.approvedAt = new Date().toISOString();
        
        // Update database
        await this.updateApprovalStatus(approvalId, 'approved', approvedBy);
        
        console.log(`[DataApproval] Approved: ${approvalId} by ${approvedBy}`);
        
        // Return data for storage
        return {
            provider: approval.provider,
            requestId: approval.requestId,
            dataType: approval.dataType,
            data: approval.data,
            metadata: {
                ...approval.metadata,
                approvalId,
                approvedBy,
                approvedAt: approval.approvedAt
            }
        };
    }

    /**
     * Deny pending data
     * 
     * @param {string} approvalId - Approval ID
     * @param {string} deniedBy - User who denied
     * @param {string} reason - Reason for denial
     */
    async deny(approvalId, deniedBy = 'system', reason = 'No reason provided') {
        const approval = this.pendingApprovals.get(approvalId);
        
        if (!approval) {
            throw new Error(`Approval request not found: ${approvalId}`);
        }
        
        if (approval.status !== 'pending') {
            throw new Error(`Approval already processed: ${approval.status}`);
        }
        
        // Mark as denied
        approval.status = 'denied';
        approval.deniedBy = deniedBy;
        approval.deniedAt = new Date().toISOString();
        approval.denialReason = reason;
        
        // Update database
        await this.updateApprovalStatus(approvalId, 'denied', deniedBy, reason);
        
        // Remove from pending queue
        this.pendingApprovals.delete(approvalId);
        
        console.log(`[DataApproval] Denied: ${approvalId} by ${deniedBy} - ${reason}`);
    }

    /**
     * Get pending approval request
     * 
     * @param {string} approvalId - Approval ID
     * @returns {Object} Approval request
     */
    getPendingApproval(approvalId) {
        return this.pendingApprovals.get(approvalId);
    }

    /**
     * List all pending approvals
     * 
     * @param {Object} filters - Optional filters
     * @returns {Array} List of pending approvals
     */
    listPendingApprovals({ provider, dataType } = {}) {
        const pending = Array.from(this.pendingApprovals.values())
            .filter(a => a.status === 'pending');
        
        if (provider) {
            return pending.filter(a => a.provider === provider);
        }
        
        if (dataType) {
            return pending.filter(a => a.dataType === dataType);
        }
        
        return pending;
    }

    /**
     * Clean up expired approvals
     */
    async cleanupExpired() {
        const now = new Date();
        let expiredCount = 0;
        
        for (const [approvalId, approval] of this.pendingApprovals.entries()) {
            if (approval.status === 'pending' && now > new Date(approval.expiresAt)) {
                approval.status = 'expired';
                await this.updateApprovalStatus(approvalId, 'expired');
                this.pendingApprovals.delete(approvalId);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`[DataApproval] Cleaned up ${expiredCount} expired approvals`);
        }
    }

    /**
     * Track approval in database
     */
    async trackApprovalInDatabase(approval) {
        if (!this.db || !this.db.isConnected) return;
        
        try {
            await this.db.query(`
                INSERT INTO [reddog].[DataApprovals]
                (ApprovalId, RequestId, Provider, DataType, Status, DataSize, RecordCount, 
                 Metadata, CreatedAt, ExpiresAt)
                VALUES (@ApprovalId, @RequestId, @Provider, @DataType, @Status, @DataSize, 
                        @RecordCount, @Metadata, GETUTCDATE(), @ExpiresAt)
            `, [
                { name: 'ApprovalId', value: approval.approvalId },
                { name: 'RequestId', value: approval.requestId },
                { name: 'Provider', value: approval.provider },
                { name: 'DataType', value: approval.dataType },
                { name: 'Status', value: approval.status },
                { name: 'DataSize', value: approval.metadata.dataSize },
                { name: 'RecordCount', value: approval.metadata.recordCount },
                { name: 'Metadata', value: JSON.stringify(approval.metadata) },
                { name: 'ExpiresAt', value: approval.expiresAt }
            ], 'zerosumag');
        } catch (err) {
            console.error(`[DataApproval] Failed to track in database: ${err.message}`);
        }
    }

    /**
     * Update approval status in database
     */
    async updateApprovalStatus(approvalId, status, processedBy = null, reason = null) {
        if (!this.db || !this.db.isConnected) return;
        
        try {
            await this.db.query(`
                UPDATE [reddog].[DataApprovals]
                SET Status = @Status,
                    ProcessedBy = @ProcessedBy,
                    ProcessedAt = GETUTCDATE(),
                    DenialReason = @DenialReason
                WHERE ApprovalId = @ApprovalId
            `, [
                { name: 'ApprovalId', value: approvalId },
                { name: 'Status', value: status },
                { name: 'ProcessedBy', value: processedBy },
                { name: 'DenialReason', value: reason }
            ], 'zerosumag');
        } catch (err) {
            console.error(`[DataApproval] Failed to update status: ${err.message}`);
        }
    }

    /**
     * Generate unique approval ID
     */
    generateApprovalId() {
        return `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Estimate record count from payload
     */
    estimateRecordCount(payload) {
        if (Array.isArray(payload)) {
            return payload.length;
        }
        if (payload && typeof payload === 'object') {
            if (payload.data && Array.isArray(payload.data)) {
                return payload.data.length;
            }
            if (payload.records && Array.isArray(payload.records)) {
                return payload.records.length;
            }
        }
        return 1;
    }

    /**
     * Get approval statistics
     */
    getStats() {
        const stats = {
            pending: 0,
            approved: 0,
            denied: 0,
            expired: 0
        };
        
        for (const approval of this.pendingApprovals.values()) {
            stats[approval.status]++;
        }
        
        return stats;
    }
}

module.exports = DataApprovalManager;
