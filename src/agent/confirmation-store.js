const crypto = require('crypto');

class ConfirmationStore {
    constructor(options = {}) {
        this.ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(1000, Number(options.ttlMs)) : 10 * 60 * 1000;
        this.items = new Map();
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
            if (item.expiresAtMs <= now - this.ttlMs) {
                this.items.delete(id);
            }
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
            actions: Array.isArray(payload.actions) ? payload.actions : [],
            previews: Array.isArray(payload.previews) ? payload.previews : [],
            correction: payload.correction && typeof payload.correction === 'object' ? payload.correction : null,
            status: 'pending',
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + this.ttlMs).toISOString(),
            expiresAtMs: now + this.ttlMs
        };
        this.items.set(id, item);
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

    accept(id) {
        return this._updateStatus(id, 'accepted');
    }

    reject(id) {
        return this._updateStatus(id, 'rejected');
    }

    markExecuted(id) {
        return this._updateStatus(id, 'executed');
    }

    _updateStatus(id, nextStatus) {
        this._cleanupExpired();
        const key = String(id || '').trim();
        const item = this.items.get(key);
        if (!item) return null;
        item.status = nextStatus;
        this.items.set(key, item);
        return { ...item };
    }
}

module.exports = {
    ConfirmationStore
};
