const crypto = require('node:crypto');

function stableAdapterId(prefix, ...parts) {
    const material = JSON.stringify(parts.map((part) => String(part ?? '').trim()));
    const digest = crypto.createHash('sha256').update(material).digest('hex');
    return `${String(prefix || 'id').replace(/[^A-Za-z0-9_-]/g, '_')}_${digest.slice(0, 32)}`;
}

module.exports = { stableAdapterId };
