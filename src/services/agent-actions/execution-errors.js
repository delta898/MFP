// Only errors created by the registry before capability.execute are classified safe.
const preExecutionFailures = new WeakSet();

function createPreExecutionValidationError(message) {
    const error = new Error(message);
    preExecutionFailures.add(error);
    return error;
}

function isPreExecutionValidationError(error) {
    return typeof error === 'object' && error !== null && preExecutionFailures.has(error);
}

module.exports = { createPreExecutionValidationError, isPreExecutionValidationError };
