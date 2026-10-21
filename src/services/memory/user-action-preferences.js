'use strict';

const Ajv2020 = require('ajv/dist/2020');

const preferenceValueValidator = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, validateFormats: false });

function getPersonalizableParameter(capability, parameterPath) {
    const path = String(parameterPath || '').trim();
    if (!path || path.split('.').some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) return null;
    const exposure = capability?.agentExposure;
    const declared = exposure?.personalizableParameters?.[path];
    if (!declared || declared.allowUserDefault !== true) return null;
    let schema = exposure.inputSchema;
    for (const part of path.split('.')) {
        if (schema?.type !== 'object' || !schema.properties || !Object.prototype.hasOwnProperty.call(schema.properties, part)) return null;
        if (Array.isArray(schema.required) && schema.required.includes(part)) return null;
        schema = schema.properties[part];
    }
    const allowedTypes = new Set(['boolean', 'string', 'integer', 'number']);
    if (!allowedTypes.has(schema?.type) || (schema.type === 'string' && !Array.isArray(schema.enum))) return null;
    return { path, schema, title: String(declared.title || path) };
}

function validatePreferenceValue(capability, parameterPath, value) {
    const parameter = getPersonalizableParameter(capability, parameterPath);
    if (!parameter) return { ok: false, error: '해당 기능에서 개인 기본값으로 저장하도록 허용한 선택 항목이 아닙니다.' };
    let validate;
    try {
        validate = preferenceValueValidator.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...parameter.schema });
    } catch (_error) {
        return { ok: false, error: '기능의 개인 기본값 계약이 올바르지 않습니다.' };
    }
    if (!validate(value)) return { ok: false, error: `‘${parameter.title}’ 값이 허용된 형식과 다릅니다.` };
    return { ok: true, parameter };
}

function setPathIfMissing(target, path, value) {
    const parts = path.split('.');
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
        if (cursor[part] === undefined) cursor[part] = {};
        if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) return false;
        cursor = cursor[part];
    }
    const key = parts[parts.length - 1];
    if (cursor[key] !== undefined) return false;
    cursor[key] = value;
    return true;
}

function applyUserActionPreferences(action, capability, preferences = []) {
    const actionId = String(capability?.id || action?.action_id || '').trim();
    const params = action?.params && typeof action.params === 'object' && !Array.isArray(action.params)
        ? structuredClone(action.params)
        : {};
    const applied = [];
    for (const preference of Array.isArray(preferences) ? preferences : []) {
        if (String(preference?.action_id || '') !== actionId) continue;
        const parameterPath = String(preference?.parameter_path || '');
        const validation = validatePreferenceValue(capability, parameterPath, preference.value);
        if (!validation.ok) continue;
        if (setPathIfMissing(params, parameterPath, preference.value)) {
            applied.push({ path: parameterPath, title: validation.parameter.title });
        }
    }
    return { action: { ...action, params }, applied };
}

module.exports = { getPersonalizableParameter, validatePreferenceValue, applyUserActionPreferences };
