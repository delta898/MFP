const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class ConfirmationStore {
    constructor(options = {}) {
        this.ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(1000, Number(options.ttlMs)) : 10 * 60 * 1000;
        this.items = new Map();
        this.persistPath = String(options.persistPath || '').trim();
        this._loadPersisted();
    }

    _now() {
        return Date.now();
    }

    _cleanupExpired() {
        const now = this._now();
        for (const [id, item] of this.items.entries()) {
            if (item.expiresAtMs <= now && item.status === 'pending') {
                item.status = 'expired';
                this.items.set(id, item);
            }
            // Accepted may still be executing, including after a restart with an
            // unknown outcome. Never infer completion or retry from elapsed time.
            const retentionStart = Math.max(item.expiresAtMs, item.completedAtMs || 0);
            if (item.status !== 'accepted' && retentionStart <= now - this.ttlMs) {
                this.items.delete(id);
            }
        }
        this._persist();
    }

    _normalizePersistedItem(item = {}) {
        return {
            id: String(item.id || '').trim(),
            conversationId: String(item.conversationId || '').trim(),
            messageId: String(item.messageId || '').trim(),
            channel: String(item.channel || 'telegram').trim(),
            userId: String(item.userId || '').trim(),
            kind: String(item.kind || 'confirmation').trim(),
            plan: item.plan && typeof item.plan === 'object' ? item.plan : null,
            actions: Array.isArray(item.actions) ? item.actions : [],
            previews: Array.isArray(item.previews) ? item.previews : [],
            correction: item.correction && typeof item.correction === 'object' ? item.correction : null,
            execution: item.execution && typeof item.execution === 'object' ? item.execution : null,
            correlation: this._normalizeCorrelation(item.correlation),
            supersededConfirmationId: String(item.supersededConfirmationId || '').trim(),
            transportChatId: String(item.transportChatId || '').trim(),
            transportMessageId: String(item.transportMessageId || '').trim(),
            status: String(item.status || 'pending').trim(),
            createdAt: String(item.createdAt || '').trim(),
            expiresAt: String(item.expiresAt || '').trim(),
            expiresAtMs: Number.isFinite(Number(item.expiresAtMs)) ? Number(item.expiresAtMs) : 0,
            completedAtMs: Number.isFinite(Number(item.completedAtMs)) ? Number(item.completedAtMs) : 0
        };
    }

    _normalizeCorrelation(value = {}) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
        const normalized = {
            kind: String(value.kind || '').trim(),
            owner_id: String(value.owner_id || value.ownerId || '').trim(),
            resource_id: String(value.resource_id || value.resourceId || '').trim(),
            operation_id: String(value.operation_id || value.operationId || '').trim()
        };
        return Object.values(normalized).every((item) => identifierPattern.test(item)) ? normalized : null;
    }

    _loadPersisted() {
        if (!this.persistPath) return;
        try {
            if (!fs.existsSync(this.persistPath)) return;
            const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
            if (!raw || !Array.isArray(raw.items)) throw new Error('Invalid confirmation state');
            const items = raw.items;
            items.forEach((item) => {
                const normalized = this._normalizePersistedItem(item);
                if (normalized.id) {
                    this.items.set(normalized.id, normalized);
                }
            });
            this._cleanupExpired();
        } catch (error) {
            throw Object.assign(new Error('Confirmation state could not be loaded safely'), { code: 'CONFIRMATION_STORAGE_ERROR', cause: error });
        }
    }

    _persist() {
        if (!this.persistPath) return;
        const directory = path.dirname(this.persistPath);
        const temporary = `${this.persistPath}.${crypto.randomUUID()}.tmp`;
        let fd;
        try {
            fs.mkdirSync(directory, { recursive: true });
            fd = fs.openSync(temporary, 'wx', 0o600);
            fs.writeFileSync(fd, JSON.stringify({ items: Array.from(this.items.values()) }, null, 2), 'utf8');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            fs.renameSync(temporary, this.persistPath);
            const dirFd = fs.openSync(directory, 'r');
            try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
        } catch (error) {
            if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
            try { fs.unlinkSync(temporary); } catch (_) {}
            throw Object.assign(new Error('Confirmation state could not be persisted safely'), { code: 'CONFIRMATION_STORAGE_ERROR', cause: error });
        }
    }

    create(payload = {}) {
        this._cleanupExpired();
        const id = String(payload.id || `confirm_${crypto.randomUUID()}`);
        const now = this._now();
        const item = {
            id,
            conversationId: String(payload.conversationId || '').trim(),
            messageId: String(payload.messageId || '').trim(),
            channel: String(payload.channel || 'telegram').trim(),
            userId: String(payload.userId || '').trim(),
            kind: String(payload.kind || 'confirmation').trim(),
            plan: payload.plan && typeof payload.plan === 'object' ? payload.plan : null,
            actions: Array.isArray(payload.actions) ? payload.actions : [],
            previews: Array.isArray(payload.previews) ? payload.previews : [],
            correction: payload.correction && typeof payload.correction === 'object' ? payload.correction : null,
            execution: null,
            correlation: this._normalizeCorrelation(payload.correlation),
            supersededConfirmationId: String(payload.superseded_confirmation_id || '').trim(),
            transportChatId: String(payload.transport_chat_id || '').trim(),
            transportMessageId: String(payload.transport_message_id || '').trim(),
            status: 'pending',
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + this.ttlMs).toISOString(),
            expiresAtMs: now + this.ttlMs
        };
        this.items.set(id, item);
        this._persist();
        return { ...item };
    }

    get(id) {
        this._cleanupExpired();
        const item = this.items.get(String(id || '').trim());
        return item ? { ...item } : null;
    }

    getPendingByUser(userId) {
        this._cleanupExpired();
        return Array.from(this.items.values())
            .filter((item) => item.userId === String(userId || '').trim() && item.status === 'pending')
            .map((item) => ({ ...item }));
    }

    getPending() {
        this._cleanupExpired();
        return Array.from(this.items.values())
            .filter((item) => item.status === 'pending')
            .map((item) => ({ ...item }));
    }

    accept(id) {
        return this._updateStatus(id, 'accepted');
    }

    reject(id) {
        return this._updateStatus(id, 'rejected');
    }

    markExecuted(id, results = []) {
        this._cleanupExpired();
        const item = this.items.get(String(id || '').trim());
        if (!item) return null;
        item.status = 'executed';
        item.completedAtMs = this._now();
        item.execution = {
            success: !results.some((entry) => entry?.result?.success === false),
            results: results.map((entry) => ({
                action_id: String(entry?.capability_id || entry?.action_id || '').slice(0, 200),
                success: entry?.result?.success !== false,
                message: String(entry?.result?.message || '').slice(0, 1000)
            }))
        };
        this.items.set(item.id, item);
        this._persist();
        return { ...item };
    }

    markExecutionFailed(id, code = 'UNKNOWN') {
        this._cleanupExpired();
        const item = this.items.get(String(id || '').trim());
        if (!item) return null;
        item.status = 'failed';
        item.completedAtMs = this._now();
        item.execution = {
            success: false,
            errorCode: String(code || 'UNKNOWN').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'UNKNOWN'
        };
        this.items.set(item.id, item);
        this._persist();
        return { ...item };
    }

    bindTransportMessage(id, payload = {}) {
        this._cleanupExpired();
        const key = String(id || '').trim();
        const item = this.items.get(key);
        if (!item) return null;
        item.transportChatId = String(payload.chatId || item.transportChatId || '').trim();
        item.transportMessageId = String(payload.messageId || item.transportMessageId || '').trim();
        this.items.set(key, item);
        this._persist();
        return { ...item };
    }

    updatePlan(id, { plan, actions, previews } = {}) {
        this._cleanupExpired();
        const item = this.items.get(String(id || '').trim());
        if (!item || item.status !== 'pending') return null;
        if (plan && typeof plan === 'object') item.plan = plan;
        if (Array.isArray(actions)) item.actions = actions;
        if (Array.isArray(previews)) item.previews = previews;
        this.items.set(item.id, item);
        this._persist();
        return { ...item };
    }

    _updateStatus(id, nextStatus) {
        this._cleanupExpired();
        const key = String(id || '').trim();
        const item = this.items.get(key);
        if (!item || item.status !== 'pending') return null;
        item.status = nextStatus;
        this.items.set(key, item);
        this._persist();
        return { ...item };
    }
}

module.exports = {
    ConfirmationStore
};
