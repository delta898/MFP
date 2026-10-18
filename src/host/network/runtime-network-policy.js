'use strict';

const net = require('node:net');

const DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS = 1500;
let applied = null;

function applyRuntimeNetworkPolicy(options = {}) {
    if (applied && options.force !== true) return applied;
    const netImpl = options.netImpl || net;
    const requested = Number(options.familyAttemptTimeoutMs || DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS);
    const familyAttemptTimeoutMs = Number.isFinite(requested)
        ? Math.max(250, Math.min(5000, Math.round(requested)))
        : DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS;
    const previousFamilyAttemptTimeoutMs = typeof netImpl.getDefaultAutoSelectFamilyAttemptTimeout === 'function'
        ? netImpl.getDefaultAutoSelectFamilyAttemptTimeout()
        : null;

    if (typeof netImpl.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
        netImpl.setDefaultAutoSelectFamilyAttemptTimeout(familyAttemptTimeoutMs);
    }

    applied = Object.freeze({
        autoSelectFamily: typeof netImpl.getDefaultAutoSelectFamily === 'function'
            ? netImpl.getDefaultAutoSelectFamily()
            : null,
        familyAttemptTimeoutMs,
        previousFamilyAttemptTimeoutMs,
        ipv4Only: false
    });
    return applied;
}

module.exports = {
    DEFAULT_FAMILY_ATTEMPT_TIMEOUT_MS,
    applyRuntimeNetworkPolicy
};
