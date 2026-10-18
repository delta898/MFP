const { machineIdSync } = require('node-machine-id');

function getDeviceIdentity() {
    return machineIdSync({ original: true });
}

module.exports = { getDeviceIdentity };
