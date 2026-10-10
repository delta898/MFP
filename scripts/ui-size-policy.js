'use strict';

const UI_SIZE_POLICIES = Object.freeze({
    htmlPartial: Object.freeze({ recommendedLines: 500, maximumLines: 800 }),
    htmlShell: Object.freeze({ recommendedLines: 300, maximumLines: 400 }),
    cssModule: Object.freeze({ recommendedLines: 900, maximumLines: 1400 }),
    jsModule: Object.freeze({ recommendedLines: 800, maximumLines: 1400 }),
    legacyJsController: Object.freeze({ recommendedLines: 2500, maximumLines: 2800 }),
    htmlManifest: Object.freeze({ recommendedEntries: 25, maximumEntries: 40 }),
    cssManifest: Object.freeze({ recommendedEntries: 120, maximumEntries: 160 }),
    jsManifest: Object.freeze({ recommendedEntries: 150, maximumEntries: 200 }),
    serverCompositionRoot: Object.freeze({ recommendedLines: 1200, maximumLines: 1500 })
});

function evaluateUiSize(policyName, size) {
    const policy = UI_SIZE_POLICIES[policyName];
    if (!policy) throw new Error(`Unknown UI size policy: ${policyName}`);
    const metric = Object.hasOwn(policy, 'maximumLines') ? 'Lines' : 'Entries';
    const recommended = policy[`recommended${metric}`];
    const maximum = policy[`maximum${metric}`];
    const count = Number(size);
    if (!Number.isInteger(count) || count < 0) throw new Error('UI size must be a non-negative integer.');
    return Object.freeze({
        policyName,
        count,
        recommended,
        maximum,
        status: count > maximum ? 'error' : count > recommended ? 'warning' : 'ok'
    });
}

module.exports = { UI_SIZE_POLICIES, evaluateUiSize };
