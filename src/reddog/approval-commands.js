/**
 * Red Dog Approval Commands
 * 
 * Handles approve/deny commands for provider data
 */

class ApprovalCommands {
    constructor({ approvalManager, blobStorage, serviceBus }) {
        this.approvalManager = approvalManager;
        this.blobStorage = blobStorage;
        this.serviceBus = serviceBus;
    }

    /**
     * Parse approval commands from user message
     * Returns command info or null if not an approval command
     */
    parseCommand(message) {
        const msg = message.toLowerCase().trim();
        
        // Approve command: "approve <approvalId>" or "give lick of approval <approvalId>"
        const approveMatch = msg.match(/^approve\s+([a-z0-9-]+)$/i);
        const lickMatch = msg.match(/^give\s+lick\s+of\s+approval\s+([a-z0-9-]+)$/i);
        
        if (approveMatch || lickMatch) {
            return {
                action: 'approve',
                approvalId: (approveMatch || lickMatch)[1],
                usedLick: !!lickMatch
            };
        }
        
        // Deny command: "deny <approvalId> [reason]"
        const denyMatch = msg.match(/^deny\s+([a-z0-9-]+)(?:\s+(.+))?$/i);
        if (denyMatch) {
            return {
                action: 'deny',
                approvalId: denyMatch[1],
                reason: denyMatch[2] || 'No reason provided'
            };
        }
        
        // List pending approvals: "list approvals" or "pending approvals"
        if (msg.match(/^(list|show|pending)\s+approvals?$/)) {
            return { action: 'list' };
        }
        
        // Show approval details: "show approval <approvalId>"
        const showMatch = msg.match(/^show\s+approval\s+([a-z0-9-]+)$/i);
        if (showMatch) {
            return {
                action: 'show',
                approvalId: showMatch[1]
            };
        }
        
        return null;
    }

    /**
     * Execute approval command
     */
    async execute(command, userId = 'system') {
        switch (command.action) {
            case 'approve':
                return await this.handleApprove(command.approvalId, userId, command.usedLick);
            
            case 'deny':
                return await this.handleDeny(command.approvalId, userId, command.reason);
            
            case 'list':
                return await this.handleList();
            
            case 'show':
                return await this.handleShow(command.approvalId);
            
            default:
                return { error: 'Unknown approval command' };
        }
    }

    /**
     * Handle approve command
     */
    async handleApprove(approvalId, userId, usedLick = false) {
        try {
            // Approve the data
            const approvedData = await this.approvalManager.approve(approvalId, userId);
            
            // Store in blob storage
            const blobInfo = await this.blobStorage.writeProviderData(approvedData);
            
            // Notify Trevor via Service Bus
            if (this.serviceBus && this.serviceBus.isConnected) {
                await this.serviceBus.sendMessage('data-approval-result', {
                    approvalId,
                    requestId: approvedData.requestId,
                    status: 'approved',
                    blobName: blobInfo.blobName,
                    approvedBy: userId
                });
            }
            
            const emoji = usedLick ? '🐕👅' : '✅';
            const header = usedLick 
                ? `${emoji} Red Dog gives the Lick of Approval! Data stored, mate!` 
                : `${emoji} Approved and stored provider data`;
            
            return {
                success: true,
                message: `${header}\n\n` +
                        `**Provider:** ${approvedData.provider}\n` +
                        `**Data Type:** ${approvedData.dataType}\n` +
                        `**Blob:** ${blobInfo.blobName}\n` +
                        `**Approved by:** ${userId}`,
                blobInfo
            };
        } catch (err) {
            return {
                success: false,
                error: err.message,
                message: `❌ Failed to approve: ${err.message}`
            };
        }
    }

    /**
     * Handle deny command
     */
    async handleDeny(approvalId, userId, reason) {
        try {
            // Deny the data
            await this.approvalManager.deny(approvalId, userId, reason);
            
            // Get approval details for response
            const approval = this.approvalManager.getPendingApproval(approvalId);
            
            // Notify Trevor via Service Bus
            if (this.serviceBus && this.serviceBus.isConnected) {
                await this.serviceBus.sendMessage('data-approval-result', {
                    approvalId,
                    requestId: approval?.requestId,
                    status: 'denied',
                    deniedBy: userId,
                    reason
                });
            }
            
            return {
                success: true,
                message: `❌ Denied provider data\n\n` +
                        `**Approval ID:** ${approvalId}\n` +
                        `**Denied by:** ${userId}\n` +
                        `**Reason:** ${reason}`
            };
        } catch (err) {
            return {
                success: false,
                error: err.message,
                message: `❌ Failed to deny: ${err.message}`
            };
        }
    }

    /**
     * Handle list command
     */
    async handleList() {
        const pending = this.approvalManager.listPendingApprovals();
        
        if (pending.length === 0) {
            return {
                success: true,
                message: 'No pending approvals',
                pending: []
            };
        }
        
        let message = `📋 **Pending Approvals (${pending.length})**\n\n`;
        
        for (const approval of pending) {
            const expiresIn = this.getTimeUntilExpiry(approval.expiresAt);
            message += `**${approval.approvalId}**\n`;
            message += `  Provider: ${approval.provider}\n`;
            message += `  Data Type: ${approval.dataType}\n`;
            message += `  Records: ${approval.metadata.recordCount}\n`;
            message += `  Size: ${this.formatBytes(approval.metadata.dataSize)}\n`;
            message += `  Expires: ${expiresIn}\n`;
            message += `  Commands: \`give lick of approval ${approval.approvalId}\` or \`deny ${approval.approvalId}\`\n\n`;
        }
        
        return {
            success: true,
            message,
            pending
        };
    }

    /**
     * Handle show command
     */
    async handleShow(approvalId) {
        const approval = this.approvalManager.getPendingApproval(approvalId);
        
        if (!approval) {
            return {
                success: false,
                message: `Approval not found: ${approvalId}`
            };
        }
        
        const expiresIn = this.getTimeUntilExpiry(approval.expiresAt);
        
        let message = `📄 **Approval Details**\n\n`;
        message += `**ID:** ${approval.approvalId}\n`;
        message += `**Request ID:** ${approval.requestId}\n`;
        message += `**Provider:** ${approval.provider}\n`;
        message += `**Data Type:** ${approval.dataType}\n`;
        message += `**Status:** ${approval.status}\n`;
        message += `**Records:** ${approval.metadata.recordCount}\n`;
        message += `**Size:** ${this.formatBytes(approval.metadata.dataSize)}\n`;
        message += `**Received:** ${new Date(approval.timestamp).toLocaleString()}\n`;
        message += `**Expires:** ${expiresIn}\n\n`;
        
        if (approval.metadata.authenticatedUser) {
            message += `**Authenticated User:** ${approval.metadata.authenticatedUser}\n`;
        }
        
        message += `\n**Commands:**\n`;
        message += `- \`give lick of approval ${approval.approvalId}\` - Red Dog approves! 🐕👅\n`;
        message += `- \`deny ${approval.approvalId} <reason>\` - Reject this data\n`;
        
        return {
            success: true,
            message,
            approval
        };
    }

    /**
     * Get time until expiry in human-readable format
     */
    getTimeUntilExpiry(expiresAt) {
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diff = expiry - now;
        
        if (diff < 0) {
            return 'Expired';
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} day${days > 1 ? 's' : ''}`;
        }
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        
        return `${minutes}m`;
    }

    /**
     * Format bytes to human-readable size
     */
    formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}

module.exports = ApprovalCommands;
