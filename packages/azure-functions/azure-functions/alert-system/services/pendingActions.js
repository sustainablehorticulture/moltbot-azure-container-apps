const { v4: uuidv4 } = require('uuid');

// In-memory store for pending SMS reply actions
// In production, use Azure Table Storage or Cosmos DB
const pendingActions = new Map();

// Map phone numbers to their most recent pending action
const phoneToAction = new Map();

class PendingActionsService {
    /**
     * Create a pending action that will be triggered when a user replies YES/NO
     * @param {string} phoneNumber - The recipient phone number
     * @param {string} siteId - Site ID for privacy isolation
     * @param {object} yesAction - Action to perform on YES reply
     * @param {object} noAction - Action to perform on NO reply (optional)
     * @param {number} expiresInMinutes - How long the action stays valid (default 30 min)
     * @returns {object} The pending action record
     */
    createPendingAction(phoneNumber, siteId, yesAction, noAction = null, expiresInMinutes = 30) {
        const actionId = uuidv4();
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        const action = {
            id: actionId,
            phoneNumber,
            siteId,
            yesAction,
            noAction,
            createdAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            status: 'pending'
        };

        pendingActions.set(actionId, action);
        // Store by phone number for quick lookup when reply comes in
        phoneToAction.set(phoneNumber, actionId);

        this.cleanupExpired();

        return action;
    }

    /**
     * Get the pending action for a phone number
     * @param {string} phoneNumber - The phone number that replied
     * @returns {object|null} The pending action or null if none/expired
     */
    getPendingActionByPhone(phoneNumber) {
        const actionId = phoneToAction.get(phoneNumber);
        if (!actionId) return null;

        const action = pendingActions.get(actionId);
        if (!action) {
            phoneToAction.delete(phoneNumber);
            return null;
        }

        // Check expiry
        if (new Date(action.expiresAt) < new Date()) {
            this.expireAction(actionId);
            return null;
        }

        return action;
    }

    /**
     * Mark a pending action as completed
     */
    completeAction(actionId, reply, result) {
        const action = pendingActions.get(actionId);
        if (!action) return null;

        action.status = 'completed';
        action.reply = reply;
        action.result = result;
        action.completedAt = new Date().toISOString();

        // Remove phone mapping so next alert can create a new action
        phoneToAction.delete(action.phoneNumber);

        return action;
    }

    /**
     * Mark a pending action as expired
     */
    expireAction(actionId) {
        const action = pendingActions.get(actionId);
        if (action) {
            action.status = 'expired';
            phoneToAction.delete(action.phoneNumber);
        }
    }

    /**
     * Clean up expired actions
     */
    cleanupExpired() {
        const now = new Date();
        for (const [actionId, action] of pendingActions) {
            if (new Date(action.expiresAt) < now && action.status === 'pending') {
                action.status = 'expired';
                phoneToAction.delete(action.phoneNumber);
            }
            // Remove very old completed/expired actions (> 24 hours)
            const ageMs = now - new Date(action.createdAt);
            if (ageMs > 24 * 60 * 60 * 1000) {
                pendingActions.delete(actionId);
            }
        }
    }

    /**
     * Get all pending actions for a site
     */
    getPendingActionsForSite(siteId) {
        const siteActions = [];
        for (const [, action] of pendingActions) {
            if (action.siteId === siteId) {
                siteActions.push(action);
            }
        }
        return siteActions;
    }

    /**
     * Get action history
     */
    getActionHistory(siteId, limit = 50) {
        const history = [];
        for (const [, action] of pendingActions) {
            if (action.siteId === siteId && action.status !== 'pending') {
                history.push(action);
            }
        }
        return history
            .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt))
            .slice(0, limit);
    }
}

module.exports = new PendingActionsService();
