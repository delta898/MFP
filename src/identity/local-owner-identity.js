const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const IDENTITY_SCHEMA_VERSION = 1;
const LOCAL_OWNER_ID_PATTERN = /^local:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class LocalOwnerIdentity {
    constructor(options = {}) {
        this.baseDir = String(options.baseDir || process.cwd());
        this.identityPath = String(options.identityPath || path.join(this.baseDir, 'data', 'identity', 'owner.json'));
        this.fs = options.fs || fs;
        this.randomUUID = options.randomUUID || (() => crypto.randomUUID());
        this.now = options.now || (() => new Date());
        this.cachedIdentity = null;
    }

    _normalizeIdentity(value = {}) {
        const ownerUserId = String(value.owner_user_id || '').trim();
        const schemaVersion = Number(value.schema_version || 0);
        const createdAt = String(value.created_at || '').trim();

        if (schemaVersion !== IDENTITY_SCHEMA_VERSION) {
            throw new Error(`지원하지 않는 owner identity schema입니다: ${schemaVersion || 'unknown'}`);
        }
        if (!LOCAL_OWNER_ID_PATTERN.test(ownerUserId)) {
            throw new Error('owner_user_id 형식이 올바르지 않습니다. 기존 identity 파일을 보존한 채 점검이 필요합니다.');
        }
        if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
            throw new Error('owner identity created_at 값이 올바르지 않습니다.');
        }

        return {
            schema_version: IDENTITY_SCHEMA_VERSION,
            owner_user_id: ownerUserId,
            identity_kind: 'local',
            created_at: createdAt
        };
    }

    _readExisting() {
        const raw = this.fs.readFileSync(this.identityPath, 'utf8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_error) {
            throw new Error('owner identity 파일을 읽을 수 없습니다. 자동 재생성하지 않고 기존 파일을 보존합니다.');
        }
        return this._normalizeIdentity(parsed);
    }

    _writeExclusive(identityInput) {
        const identityDir = path.dirname(this.identityPath);
        this.fs.mkdirSync(identityDir, { recursive: true });
        const identity = this._normalizeIdentity(identityInput);

        try {
            this.fs.writeFileSync(
                this.identityPath,
                `${JSON.stringify(identity, null, 2)}\n`,
                { encoding: 'utf8', mode: 0o600, flag: 'wx' }
            );
            try { this.fs.chmodSync(this.identityPath, 0o600); } catch (_ignore) { }
            return identity;
        } catch (error) {
            if (error?.code === 'EEXIST') {
                return this._readExisting();
            }
            throw error;
        }
    }

    _createNew() {
        return this._writeExclusive({
            schema_version: IDENTITY_SCHEMA_VERSION,
            owner_user_id: `local:${this.randomUUID()}`,
            created_at: this.now().toISOString()
        });
    }

    hasStoredIdentity() {
        return this.fs.existsSync(this.identityPath);
    }

    adopt(identityInput = {}) {
        const identity = this._normalizeIdentity({
            schema_version: IDENTITY_SCHEMA_VERSION,
            owner_user_id: identityInput.owner_user_id,
            created_at: identityInput.created_at || this.now().toISOString()
        });
        const resolved = this.hasStoredIdentity()
            ? this._readExisting()
            : this._writeExclusive(identity);
        if (resolved.owner_user_id !== identity.owner_user_id) {
            throw new Error('기존 owner identity와 GraphDB owner가 일치하지 않습니다. 자동 변경하지 않고 점검이 필요합니다.');
        }
        this.cachedIdentity = resolved;
        return { ...resolved };
    }

    resolve() {
        if (this.cachedIdentity) return { ...this.cachedIdentity };

        const identity = this.hasStoredIdentity()
            ? this._readExisting()
            : this._createNew();
        this.cachedIdentity = identity;
        return { ...identity };
    }

    getOwnerUserId() {
        return this.resolve().owner_user_id;
    }
}

module.exports = {
    IDENTITY_SCHEMA_VERSION,
    LOCAL_OWNER_ID_PATTERN,
    LocalOwnerIdentity
};
