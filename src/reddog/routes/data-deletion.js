/**
 * Meta / Facebook Data Deletion Callback
 *
 * Required by Meta for all apps that access user data via Facebook Login.
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  SECURITY MODEL                                                         │
 * │                                                                         │
 * │  1. Meta callback is authenticated via HMAC-SHA256 signed_request       │
 * │     (signed with META_APP_SECRET — cannot be forged without the secret) │
 * │  2. Deletion is STAGED for 72 hours — data is NOT immediately removed   │
 * │  3. Admin can CANCEL a pending deletion via DELETE /api/data-deletion   │
 * │     with a valid Bearer token (CLAWDBOT_GATEWAY_TOKEN)                  │
 * │  4. IP-based rate limiting: max 5 requests per 24 hours per IP          │
 * │  5. After 72h the deletion is executed on next status check             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * POST   /api/data-deletion              — Meta callback (signed_request)
 * GET    /api/data-deletion/status?id=   — public status page for users
 * DELETE /api/data-deletion/:code        — admin cancel (Bearer token required)
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const BASE_URL      = 'https://clawdbot.happybush-1b235e08.australiasoutheast.azurecontainerapps.io';
const HOLD_HOURS    = 72;
const HOLD_MS       = HOLD_HOURS * 60 * 60 * 1000;
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_N  = 5;

// In-memory stores (sufficient for Meta's review window; container restart resets)
const deletionQueue = new Map(); // code → record
const rateLimiter   = new Map(); // ip  → [timestamps]

// ── Helpers ──────────────────────────────────────────────────────────────────

function verifySignedRequest(signedRequest) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) throw new Error('META_APP_SECRET not configured');

    const [encodedSig, encodedPayload] = (signedRequest || '').split('.');
    if (!encodedSig || !encodedPayload) throw new Error('Malformed signed_request');

    const expected = crypto
        .createHmac('sha256', appSecret)
        .update(encodedPayload)
        .digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Pad to equal length before timingSafeEqual
    const a = Buffer.from(encodedSig.padEnd(expected.length, ' '));
    const b = Buffer.from(expected.padEnd(encodedSig.length, ' '));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new Error('Signature mismatch');
    }

    return JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
}

function checkRateLimit(ip) {
    const now  = Date.now();
    const hits = (rateLimiter.get(ip) || []).filter(t => now - t < RATE_LIMIT_MS);
    if (hits.length >= RATE_LIMIT_N) return false;
    hits.push(now);
    rateLimiter.set(ip, hits);
    return true;
}

function statusPage(title, colour, bodyHtml) {
    return `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"><title>${title} — Agentic Ag</title>
<style>
  *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:#f5f5f5;margin:0;padding:2rem}
  .card{background:#fff;border-radius:8px;padding:2rem;max-width:640px;margin:0 auto;
        box-shadow:0 2px 8px rgba(0,0,0,.1)}
  h2{margin-top:0;color:${colour}}
  .warn{background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:1rem;margin:1rem 0}
  .danger{background:#f8d7da;border:1px solid #dc3545;border-radius:4px;padding:1rem;margin:1rem 0}
  table{width:100%;border-collapse:collapse;margin:1rem 0}
  td{padding:.5rem .75rem;border:1px solid #dee2e6}td:first-child{font-weight:600;width:40%}
  .badge{display:inline-block;padding:.25rem .6rem;border-radius:12px;font-size:.85rem;font-weight:600}
  .pending{background:#fff3cd;color:#856404}.deleted{background:#d4edda;color:#155724}
  .cancelled{background:#f8d7da;color:#721c24}
  footer{text-align:center;margin-top:1.5rem;color:#6c757d;font-size:.85rem}
</style></head>
<body><div class="card">${bodyHtml}<footer>Agentic Ag &mdash; Red Dog &mdash;
<a href="mailto:hello@agentic.ag">hello@agentic.ag</a></footer></div></body></html>`;
}

// ── Module ────────────────────────────────────────────────────────────────────

module.exports = (db) => {

    // ── POST / — Meta signed_request callback ────────────────────────────────
    router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

        // Rate limit
        if (!checkRateLimit(ip)) {
            console.warn(`[DataDeletion] Rate limit exceeded for IP ${ip}`);
            return res.status(429).json({ error: 'Too many requests — try again tomorrow' });
        }

        // Verify Meta signature
        let payload;
        try {
            payload = verifySignedRequest(req.body.signed_request);
        } catch (err) {
            console.warn(`[DataDeletion] ❌ Auth failure: ${err.message}`);
            return res.status(403).json({ error: err.message });
        }

        const { user_id: facebookUserId } = payload;
        if (!facebookUserId) return res.status(400).json({ error: 'No user_id in payload' });

        // Check for existing pending request for this user — don't double-stage
        for (const [, rec] of deletionQueue) {
            if (rec.facebookUserId === facebookUserId && rec.status === 'PENDING') {
                const baseUrl = process.env.CLAWDBOT_URL || BASE_URL;
                console.log(`[DataDeletion] Duplicate request for user ${facebookUserId} — returning existing code`);
                return res.json({ url: `${baseUrl}/api/data-deletion/status?id=${rec.code}`, confirmation_code: rec.code });
            }
        }

        const code        = crypto.randomBytes(12).toString('hex');
        const requestedAt = new Date().toISOString();
        const executeAt   = new Date(Date.now() + HOLD_MS).toISOString();

        deletionQueue.set(code, {
            code,
            facebookUserId,
            requestedAt,
            executeAt,
            status:      'PENDING',
            completedAt: null,
            errors:      []
        });

        console.log(`[DataDeletion] ⏳ Staged deletion for Facebook user_id=${facebookUserId}, code=${code}, executes=${executeAt}`);
        console.warn(`[DataDeletion] ⚠️  ADMIN ACTION REQUIRED — cancel within ${HOLD_HOURS}h at DELETE /api/data-deletion/${code} with Bearer token`);

        const baseUrl = process.env.CLAWDBOT_URL || BASE_URL;
        return res.json({
            url:               `${baseUrl}/api/data-deletion/status?id=${code}`,
            confirmation_code: code
        });
    });

    // ── GET /status — user-facing status page ────────────────────────────────
    router.get('/status', async (req, res) => {
        const { id } = req.query;

        if (!id) {
            return res.send(statusPage('Data Deletion', '#343a40', `
                <h2>Data Deletion — Agentic Ag</h2>
                <p>To check the status of a deletion request, use your confirmation code:</p>
                <code>/api/data-deletion/status?id=YOUR_CODE</code>
                <p>To request deletion of your data, go to your Facebook settings and remove this app.</p>`));
        }

        const record = deletionQueue.get(id);
        if (!record) {
            return res.status(404).send(statusPage('Not Found', '#dc3545', `
                <h2>Request Not Found</h2>
                <p>No deletion request found for confirmation code <strong>${id}</strong>.</p>
                <div class="warn">⚠️ Records older than 7 days may have been purged.
                Contact <a href="mailto:hello@agentic.ag">hello@agentic.ag</a> for assistance.</div>`));
        }

        // Execute deletion if hold period has passed
        if (record.status === 'PENDING' && Date.now() >= new Date(record.executeAt).getTime()) {
            record.status = 'DELETING';
            const result = await deleteUserData(db, record.facebookUserId);
            record.status      = 'DELETED';
            record.completedAt = new Date().toISOString();
            record.errors      = result.errors;
            console.log(`[DataDeletion] ✅ Deletion executed for code=${id}`);
        }

        const statusBadge = {
            PENDING:   '<span class="badge pending">⏳ Pending — scheduled for deletion</span>',
            DELETING:  '<span class="badge pending">⏳ Deletion in progress…</span>',
            DELETED:   '<span class="badge deleted">✅ Deleted</span>',
            CANCELLED: '<span class="badge cancelled">🚫 Cancelled by administrator</span>'
        }[record.status] || record.status;

        const isPending   = record.status === 'PENDING';
        const isDeleted   = record.status === 'DELETED';
        const isCancelled = record.status === 'CANCELLED';

        const warningBlock = isPending ? `
            <div class="danger">
                <strong>⚠️ WARNING — This action is irreversible</strong><br>
                All data linked to your Facebook account will be <strong>permanently deleted</strong>
                on <strong>${new Date(record.executeAt).toUTCString()}</strong>.
                This includes authentication tokens, billing records, subscriptions, and all
                associated account data. <strong>This cannot be undone.</strong>
            </div>` : '';

        const cancelledBlock = isCancelled ? `
            <div class="warn">This deletion request was cancelled by the Agentic Ag administrator.
            Your data has <strong>not</strong> been removed. If you still wish to delete your data,
            contact <a href="mailto:hello@agentic.ag">hello@agentic.ag</a>.</div>` : '';

        const deletedBlock = isDeleted ? `
            <div class="warn">
                <strong>Your data has been permanently removed.</strong> The following was deleted:
                OAuth tokens, social media authorisations, billing account, credit history,
                and subscription records linked to your Facebook account.
            </div>` : '';

        return res.send(statusPage('Deletion Status', isDeleted ? '#155724' : '#856404', `
            <h2>Data Deletion Status</h2>
            ${warningBlock}${cancelledBlock}${deletedBlock}
            <table>
                <tr><td>Status</td><td>${statusBadge}</td></tr>
                <tr><td>Confirmation Code</td><td><code>${id}</code></td></tr>
                <tr><td>Requested</td><td>${record.requestedAt}</td></tr>
                ${isPending  ? `<tr><td>Scheduled For</td><td>${record.executeAt}</td></tr>` : ''}
                ${isDeleted  ? `<tr><td>Completed</td><td>${record.completedAt}</td></tr>` : ''}
                ${isCancelled? `<tr><td>Cancelled</td><td>${record.completedAt}</td></tr>` : ''}
            </table>
            <p style="color:#6c757d;font-size:.9rem">
                If you believe this request was made in error, contact
                <a href="mailto:hello@agentic.ag">hello@agentic.ag</a> immediately.
            </p>`));
    });

    // ── DELETE /:code — admin cancel (Bearer token required) ─────────────────
    router.delete('/:code', (req, res) => {
        const gatewayToken = process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN;
        const authHeader   = req.headers['authorization'] || '';
        const token        = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!gatewayToken || !token || token !== gatewayToken) {
            return res.status(401).json({ error: 'Unauthorized — admin Bearer token required' });
        }

        const record = deletionQueue.get(req.params.code);
        if (!record) return res.status(404).json({ error: 'Request not found' });

        if (record.status !== 'PENDING') {
            return res.status(409).json({ error: `Cannot cancel — status is ${record.status}` });
        }

        record.status      = 'CANCELLED';
        record.completedAt = new Date().toISOString();
        console.log(`[DataDeletion] 🚫 Admin cancelled deletion code=${req.params.code} for user=${record.facebookUserId}`);

        return res.json({ cancelled: true, code: req.params.code, message: 'Deletion request cancelled — no data has been removed' });
    });

    return router;
};

// ── Deletion logic ────────────────────────────────────────────────────────────

async function deleteUserData(db, facebookUserId) {
    const result = { tablesCleared: [], rowsDeleted: 0, errors: [] };

    if (!db || !db.isConnected) {
        console.warn('[DataDeletion] DB not connected — cannot delete data');
        result.errors.push('Database not connected');
        return result;
    }

    const params = [{ name: 'UserId', value: facebookUserId }];

    const deletions = [
        { table: '[reddog].[SocialMediaTokens]',  sql: `DELETE FROM [reddog].[SocialMediaTokens] WHERE UserId = @UserId`,   note: 'OAuth tokens' },
        { table: '[reddog].[OAuthStates]',         sql: `DELETE FROM [reddog].[OAuthStates] WHERE UserId = @UserId`,         note: 'OAuth states' },
        { table: '[reddog].[CreditTransactions]',  sql: `DELETE FROM [reddog].[CreditTransactions] WHERE UserOid = @UserId`, note: 'Credit history' },
        { table: '[reddog].[Subscriptions]',       sql: `DELETE FROM [reddog].[Subscriptions] WHERE UserOid = @UserId`,      note: 'Subscriptions' },
        { table: '[reddog].[BillingAccounts]',     sql: `DELETE FROM [reddog].[BillingAccounts] WHERE UserOid = @UserId`,    note: 'Billing account' }
    ];

    for (const del of deletions) {
        try {
            await db.query(del.sql, params, 'zerosumag');
            result.tablesCleared.push(del.table);
            result.rowsDeleted++;
            console.log(`[DataDeletion] ✅ ${del.table} (${del.note})`);
        } catch (err) {
            console.warn(`[DataDeletion] ⚠️  ${del.table}: ${err.message}`);
            result.errors.push(`${del.table}: ${err.message}`);
        }
    }

    return result;
}
