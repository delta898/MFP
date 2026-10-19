'use strict';

function sanitizeFileName(value) {
    if (!value) return 'untitled';
    let cleaned = String(value).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    if (cleaned.length > 200) cleaned = cleaned.substring(0, 200);
    return cleaned;
}

module.exports = { sanitizeFileName };
