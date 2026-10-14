'use strict';

const Ajv2020 = require('ajv/dist/2020');
const semver = require('semver');

const PLUGIN_MANIFEST_VERSION = 1;
const PLUGIN_HOST_API_VERSION = '1.0.0';
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const OPERATION_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SCHEMA_CHILD_KEYWORDS = new Set([
    '$defs', 'additionalItems', 'additionalProperties', 'allOf', 'anyOf', 'contentSchema',
    'contains', 'definitions', 'dependencies', 'dependentSchemas', 'else', 'if', 'items',
    'not', 'oneOf', 'patternProperties', 'properties', 'propertyNames', 'prefixItems',
    'then', 'unevaluatedItems', 'unevaluatedProperties'
]);
const SCHEMA_MAP_KEYWORDS = new Set([
    '$defs', 'definitions', 'dependentSchemas', 'dependencies', 'patternProperties', 'properties'
]);

class PluginContractError extends Error {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'PluginContractError';
        this.code = options.code || 'PLUGIN_CONTRACT_INVALID';
    }
}

const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
    validateFormats: false
});

const manifestValidator = ajv.compile({
    $schema: JSON_SCHEMA_DIALECT,
    type: 'object',
    additionalProperties: false,
    required: ['manifestVersion', 'id', 'name', 'hostApi', 'summary', 'operations'],
    properties: {
        manifestVersion: { const: PLUGIN_MANIFEST_VERSION },
        id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
        name: { type: 'string', minLength: 1, pattern: '\\S' },
        hostApi: { type: 'string', minLength: 1 },
        summary: { type: 'string', minLength: 1, pattern: '\\S' },
        operations: {
            type: 'object',
            minProperties: 1,
            propertyNames: { pattern: '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$' },
            additionalProperties: {
                type: 'object',
                additionalProperties: false,
                required: ['description', 'inputSchema', 'outputSchema', 'capabilities'],
                properties: {
                    description: { type: 'string', minLength: 1, pattern: '\\S' },
                    inputSchema: { type: 'object' },
                    outputSchema: { type: 'object' },
                    capabilities: {
                        type: 'array',
                        uniqueItems: true,
                        items: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$' }
                    }
                }
            }
        }
    }
});

function assertLocalSchemaReferences(schema, label) {
    if (!schema || typeof schema !== 'object') return;
    if (Array.isArray(schema)) {
        schema.forEach((item) => assertLocalSchemaReferences(item, label));
        return;
    }
    if (typeof schema.$ref === 'string' && !schema.$ref.startsWith('#')) {
        throw new PluginContractError(`${label} may only use local JSON Schema references.`);
    }
    if (typeof schema.$dynamicRef === 'string' && !schema.$dynamicRef.startsWith('#')) {
        throw new PluginContractError(`${label} may only use local JSON Schema references.`);
    }
    if (schema.$schema !== undefined && schema.$schema !== JSON_SCHEMA_DIALECT) {
        throw new PluginContractError(`${label} must use JSON Schema 2020-12.`);
    }
    SCHEMA_CHILD_KEYWORDS.forEach((keyword) => {
        const child = schema[keyword];
        if (child === undefined) return;
        if (SCHEMA_MAP_KEYWORDS.has(keyword) && child && typeof child === 'object' && !Array.isArray(child)) {
            Object.values(child).forEach((nestedSchema) => assertLocalSchemaReferences(nestedSchema, label));
        } else {
            assertLocalSchemaReferences(child, label);
        }
    });
}

function freezeJson(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
    if (!value || typeof value !== 'object') return value;
    const copy = {};
    Object.entries(value).forEach(([key, item]) => {
        Object.defineProperty(copy, key, {
            value: freezeJson(item),
            enumerable: true,
            configurable: false,
            writable: false
        });
    });
    return Object.freeze(copy);
}

function compileOperationSchema(schema, label) {
    assertLocalSchemaReferences(schema, label);
    try {
        return ajv.compile({ $schema: JSON_SCHEMA_DIALECT, ...schema });
    } catch (cause) {
        throw new PluginContractError(`${label} is not a valid JSON Schema 2020-12 schema.`, { cause });
    }
}

function normalizePluginManifest(manifest, packageVersion) {
    if (!manifestValidator(manifest)) {
        const detail = ajv.errorsText(manifestValidator.errors, { separator: '; ' });
        throw new PluginContractError(`Plugin manifest is invalid: ${detail}`);
    }
    if (!semver.valid(packageVersion)) {
        throw new PluginContractError('Plugin package version must be valid SemVer.');
    }
    if (!semver.validRange(manifest.hostApi)
        || !semver.satisfies(PLUGIN_HOST_API_VERSION, manifest.hostApi)) {
        throw new PluginContractError(
            `Plugin ${manifest.id} does not support Plugin Host API ${PLUGIN_HOST_API_VERSION}.`,
            { code: 'PLUGIN_HOST_API_INCOMPATIBLE' }
        );
    }

    const operations = Object.create(null);
    const publicOperations = {};
    for (const [operationId, operation] of Object.entries(manifest.operations)) {
        const inputSchema = freezeJson(operation.inputSchema);
        const outputSchema = freezeJson(operation.outputSchema);
        const capabilities = Object.freeze([...operation.capabilities]);
        const inputValidator = compileOperationSchema(inputSchema, `Input schema for ${manifest.id}.${operationId}`);
        const outputValidator = compileOperationSchema(outputSchema, `Output schema for ${manifest.id}.${operationId}`);
        operations[operationId] = Object.freeze({
            description: operation.description.trim(),
            inputSchema,
            outputSchema,
            capabilities,
            validateInput: inputValidator,
            validateOutput: outputValidator
        });
        publicOperations[operationId] = Object.freeze({
            description: operation.description.trim(),
            inputSchema,
            outputSchema,
            capabilities
        });
    }

    const safeManifest = Object.freeze({
        manifestVersion: manifest.manifestVersion,
        id: manifest.id,
        name: manifest.name.trim(),
        hostApi: manifest.hostApi,
        summary: manifest.summary.trim(),
        operations: Object.freeze(publicOperations)
    });

    return Object.freeze({
        manifestVersion: manifest.manifestVersion,
        id: manifest.id,
        name: manifest.name.trim(),
        hostApi: manifest.hostApi,
        summary: manifest.summary.trim(),
        packageVersion,
        manifest: safeManifest,
        operations: Object.freeze(operations)
    });
}

function normalizePluginDescriptor(plugin) {
    if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
        throw new PluginContractError('Plugin descriptor must be an object.');
    }
    const manifest = normalizePluginManifest(plugin.manifest, plugin.version);
    if (!plugin.operations || typeof plugin.operations !== 'object' || Array.isArray(plugin.operations)) {
        throw new PluginContractError(`Plugin ${manifest.id} must provide runtime operations.`);
    }

    const declaredIds = Object.keys(manifest.operations).sort();
    const implementationIds = Object.keys(plugin.operations).sort();
    if (JSON.stringify(declaredIds) !== JSON.stringify(implementationIds)) {
        throw new PluginContractError(`Plugin ${manifest.id} runtime operations do not match its manifest.`, {
            code: 'PLUGIN_OPERATION_MISMATCH'
        });
    }

    const operations = Object.create(null);
    for (const operationId of declaredIds) {
        const implementation = plugin.operations[operationId];
        if (!implementation || typeof implementation.execute !== 'function') {
            throw new PluginContractError(`Operation ${manifest.id}.${operationId} must provide execute().`);
        }
        operations[operationId] = Object.freeze({
            description: manifest.operations[operationId].description,
            inputSchema: manifest.operations[operationId].inputSchema,
            outputSchema: manifest.operations[operationId].outputSchema,
            capabilities: manifest.operations[operationId].capabilities,
            validateInput: manifest.operations[operationId].validateInput,
            validateOutput: manifest.operations[operationId].validateOutput,
            execute: implementation.execute
        });
    }

    return Object.freeze({
        manifest: manifest.manifest,
        id: manifest.id,
        name: manifest.name,
        version: manifest.packageVersion,
        operations: Object.freeze(operations)
    });
}

module.exports = {
    JSON_SCHEMA_DIALECT,
    PLUGIN_HOST_API_VERSION,
    PLUGIN_MANIFEST_VERSION,
    PluginContractError,
    normalizePluginDescriptor,
    normalizePluginManifest
};
