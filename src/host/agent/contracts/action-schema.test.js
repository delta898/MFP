const test = require('node:test');
const assert = require('node:assert/strict');
const { validateActionEnvelope } = require('./action-schema');

function createRegistry(capabilities) {
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    return { get: (id) => byId.get(id) || null };
}

function action(domain, name, type, params = {}) {
    return { id: 'inv_1', action_id: `${domain}.${name}`, params };
}

test('Agent action envelope accepts a newly registered action type when it matches the catalog', () => {
    const capability = {
        id: 'weather.forecast',
        domain: 'weather',
        name: 'forecast',
        type: 'weather.query',
        agentExposure: {
            inputSchema: {
                type: 'object',
                properties: { location: { type: 'string', minLength: 1 } },
                required: ['location'],
                additionalProperties: false
            }
        }
    };

    const result = validateActionEnvelope({ actions: [{
        ...action('weather', 'forecast', 'weather.query', { location: '서울' }),
        type: 'attacker.chosen', domain: 'other', name: 'untrusted'
    }] }, createRegistry([capability]));
    assert.equal(result.ok, true);
    assert.equal(result.envelope.actions[0].domain, 'weather');
    assert.equal(result.envelope.actions[0].name, 'forecast');
    assert.equal(result.envelope.actions[0].type, 'weather.query');
});

test('Agent action envelope rejects params outside the registered schema', () => {
    const capability = {
        id: 'weather.forecast',
        domain: 'weather',
        name: 'forecast',
        type: 'weather.query',
        agentExposure: {
            inputSchema: {
                type: 'object',
                properties: { location: { type: 'string', minLength: 1 } },
                required: ['location'],
                additionalProperties: false
            }
        }
    };

    const result = validateActionEnvelope({
        actions: [action('weather', 'forecast', 'weather.query', { location: '서울', secret: 'unexpected' })]
    }, createRegistry([capability]));
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /inputSchema/);
});

test('Agent action envelope does not expose registered internal capabilities without an Agent descriptor', () => {
    const capability = {
        id: 'internal.secret',
        domain: 'internal',
        name: 'secret',
        type: 'internal.query'
    };
    const result = validateActionEnvelope({
        actions: [action('internal', 'secret', 'internal.query')]
    }, createRegistry([capability]));
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /catalog/);
});

test('Agent action envelope permits multiple registered domains without a fixed domain-count mapping rule', () => {
    const capabilities = ['alpha', 'beta', 'gamma'].map((domain) => ({
        id: `${domain}.read`,
        domain,
        name: 'read',
        type: `${domain}.query`,
        agentExposure: { inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
    }));
    const result = validateActionEnvelope({
        actions: capabilities.map((capability) => action(capability.domain, capability.name, capability.type))
    }, createRegistry(capabilities));
    assert.equal(result.ok, true);
});
