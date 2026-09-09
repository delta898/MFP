const { PROFILE_ENUMS } = require('./writing-profile');

const BLOG_WRITING_OVERRIDE_FIELDS = Object.freeze({
    length: Object.freeze({ enumKey: 'lengthPreset', path: ['channel', 'length', 'preset'] }),
    opening: Object.freeze({ enumKey: 'opening', path: ['channel', 'structure', 'opening'] }),
    development: Object.freeze({ enumKey: 'development', path: ['channel', 'structure', 'development'] }),
    ending: Object.freeze({ enumKey: 'ending', path: ['channel', 'structure', 'ending'] })
});

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBlogWritingOverrides(input = {}) {
    const source = isRecord(input) ? input : {};
    const result = {};
    for (const [field, definition] of Object.entries(BLOG_WRITING_OVERRIDE_FIELDS)) {
        const value = String(source[field] || '').trim().toLowerCase();
        if (PROFILE_ENUMS[definition.enumKey].includes(value)) result[field] = value;
    }
    return result;
}

function validateBlogWritingOverrides(input = {}) {
    if (input === undefined || input === null || input === '') return { valid: true, errors: [], value: {} };
    if (!isRecord(input)) {
        return {
            valid: false,
            errors: [{ field: 'writingOverrides', code: 'WRITING_OVERRIDES_INVALID', message: '이번 글 구성 값을 확인해 주세요.' }],
            value: {}
        };
    }
    const errors = [];
    const allowedFields = new Set(Object.keys(BLOG_WRITING_OVERRIDE_FIELDS));
    for (const [field, rawValue] of Object.entries(input)) {
        if (!allowedFields.has(field)) {
            errors.push({ field: `writingOverrides.${field}`, code: 'WRITING_OVERRIDE_FIELD_UNSUPPORTED', message: '이번 글에서 변경할 수 없는 글쓰기 항목입니다.' });
            continue;
        }
        const value = String(rawValue || '').trim().toLowerCase();
        const definition = BLOG_WRITING_OVERRIDE_FIELDS[field];
        if (value && !PROFILE_ENUMS[definition.enumKey].includes(value)) {
            errors.push({ field: `writingOverrides.${field}`, code: 'WRITING_OVERRIDE_VALUE_INVALID', message: `${field} 선택값을 확인해 주세요.` });
        }
    }
    return { valid: errors.length === 0, errors, value: normalizeBlogWritingOverrides(input) };
}

function applyBlogWritingOverridesToProjection(projection = {}, input = {}) {
    const next = JSON.parse(JSON.stringify(projection));
    const overrides = normalizeBlogWritingOverrides(input);
    for (const [field, value] of Object.entries(overrides)) {
        const path = BLOG_WRITING_OVERRIDE_FIELDS[field].path;
        let target = next;
        for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]];
        target[path[path.length - 1]] = value;
    }
    return { projection: next, overrides };
}

module.exports = {
    BLOG_WRITING_OVERRIDE_FIELDS,
    normalizeBlogWritingOverrides,
    validateBlogWritingOverrides,
    applyBlogWritingOverridesToProjection
};
