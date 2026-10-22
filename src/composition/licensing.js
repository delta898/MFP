const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Logger = require('../utilities/logging/logger');
const { resolveSupabasePublicConnection } = require('../adapters/supabase/public-connection');
const { writeLicenseKey } = require('../adapters/storage/license-keys/license-key-storage');
const { createSupabaseLicenseApi } = require('../adapters/licensing/supabase/license-api');
const { getDeviceIdentity } = require('../host/licensing/device-identity');
const { createLicenseService } = require('../services/licensing/license-service');

function createLicensingRuntime(options = {}) {
    const config = options.config;
    if (!config) throw new TypeError('Licensing composition requires runtime configuration.');
    const logger = options.Logger || Logger;
    const connection = resolveSupabasePublicConnection(config);
    const createSupabaseClient = options.createSupabaseClient || createClient;
    const machineIdentity = options.getHardwareId || getDeviceIdentity;
    const client = options.supabaseClient || (connection.configured
        ? createSupabaseClient(connection.url, connection.publishableKey)
        : null);
    const licenseApi = options.licenseApi || (client ? createSupabaseLicenseApi({ client }) : null);
    const licenseKeyFilePath = String(config.LICENSE_KEY_FILE_PATH || config.PATHS?.licenseKeyFile || '').trim();

    const License = createLicenseService({
        Logger: logger,
        licenseApi,
        getHardwareId: machineIdentity,
        getInitialLicenseKey: () => config.LICENSE_KEY,
        licenseKeyUsesEnvironmentOverride: config.LICENSE_KEY_USES_ENV_OVERRIDE === true,
        licenseKeyDiagnostics: {
            source: config.LICENSE_KEY_SOURCE || (config.LICENSE_KEY ? 'configured' : 'missing'),
            localFilePresent: config.LICENSE_KEY_LOCAL_PRESENT === true
        },
        licenseKeyFilePath,
        persistLicenseKey: (licenseKey) => writeLicenseKey(licenseKeyFilePath, licenseKey, fs, path)
    });

    return { License };
}

module.exports = {
    createLicensingRuntime
};
