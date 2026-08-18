const capabilities = require('./capabilities');
const { createSmartUsageService, normalizeSessionId } = require('./usage-service');

module.exports = {
    ...capabilities,
    createSmartUsageService,
    normalizeSessionId
};
