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
            if (item.expiresAtMs <= now - this.ttlMs) {
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
            supersededConfirmationId: String(item.supersededConfirmationId || '').trim(),
            transportChatId: String(item.transportChatId || '').trim(),
            transportMessageId: String(item.transportMessageId || '').trim(),
            status: String(item.status || 'pending').trim(),
            createdAt: String(item.createdAt || '').trim(),
            expiresAt: String(item.expiresAt || '').trim(),
            expiresAtMs: Number.isFinite(Number(item.expiresAtMs)) ? Number(item.expiresAtMs) : 0
        };
    }

    _loadPersisted() {
        if (!this.persistPath) return;
        try {
            if (!fs.existsSync(this.persistPath)) return;
            const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
            const items = Array.isArray(raw?.items) ? raw.items : [];
            items.forEach((item) => {
                const normalized = this._normalizePersistedItem(item);
                if (normalized.id) {
                    this.items.set(normalized.id, normalized);
                }
            });
            this._cleanupExpired();
        } catch (_error) {
            // Ignore persistence load failures and continue in memory-only mode.
        }
    }

    _persist() {
        if (!this.persistPath) return;
        try {
            fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
            fs.writeFileSync(this.persistPath, JSON.stringify({
                items: Array.from(this.items.values())
            }, null, 2), 'utf8');
        } catch (_error) {
            // Ignore persistence write failures to avoid breaking runtime behavior.
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

    markExecuted(id) {
        return this._updateStatus(id, 'executed');
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

    _updateStatus(id, nextStatus) {
        this._cleanupExpired();
        const key = String(id || '').trim();
        const item = this.items.get(key);
        if (!item) return null;
        item.status = nextStatus;
        this.items.set(key, item);
        this._persist();
        return { ...item };
    }
}

module.exports = {
    ConfirmationStore
};
