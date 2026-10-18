const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const CONFIG = require('../config-loader');
const Logger = require('../utilities/logging/logger');
const { resolveSupabasePublicConnection } = require('../environment/runtime-profile');
const { writeLicenseKey } = require('../adapters/storage/license-keys/license-key-storage');
const { createSupabaseLicenseApi } = require('../adapters/licensing/supabase/license-api');
const { getDeviceIdentity } = require('../host/licensing/device-identity');
const { createLicenseService } = require('../services/licensing/license-service');

function createLicensingRuntime(options = {}) {
    const config = options.config || CONFIG;
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
        licenseKeyFilePath,
        persistLicenseKey: (licenseKey) => writeLicenseKey(licenseKeyFilePath, licenseKey, fs, path)
    });

    return { License };
}

const { License } = createLicensingRuntime();

module.exports = {
    License,
    createLicensingRuntime
};
