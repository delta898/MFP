function createSupabaseLicenseApi({ client } = {}) {
    if (!client || typeof client.rpc !== 'function' || !client.functions?.invoke) {
        throw new Error('Supabase client is required for the licensing adapter');
    }

    const rpc = (name, args) => client.rpc(name, args);
    const invoke = (name, body) => client.functions.invoke(name, { body });
    const publishQuotaOperations = new Set([
        'reserve_publish_quota',
        'commit_publish_quota',
        'release_publish_quota'
    ]);
    const smartUsageOperations = new Set([
        'reserve_smart_usage',
        'commit_smart_usage',
        'release_smart_usage'
    ]);

    return {
        sendRegistrationCode: (body) => invoke('send-license-code', body),
        markRegistrationCodeSendStatus: (args) => rpc('mark_license_registration_code_send_status', args),
        requestRegistrationCode: (email) => rpc('request_license_registration', { p_email: email }),
        requestRecoveryCode: (email) => rpc('request_license_recovery', { p_email: email }),
        issueTestLicense: (hwid) => rpc('issue_test_license', { p_hwid: hwid }),
        publishQuota: (operation, args) => {
            if (!publishQuotaOperations.has(operation)) throw new Error('Unsupported publish quota operation');
            return rpc(operation, args);
        },
        smartUsage: (operation, args) => {
            if (!smartUsageOperations.has(operation)) throw new Error('Unsupported smart usage operation');
            return rpc(operation, args);
        },
        getSmartUsageStatus: (args) => rpc('get_smart_usage_status', args),
        issueTrendsAccessToken: (body) => invoke('issue-trends-access-token', body),
        verifyRegistration: (args) => rpc('verify_license_registration', args),
        verifyRecovery: (args) => rpc('verify_license_recovery', args),
        upgradeLicense: (args) => rpc('upgrade_license_plan', args),
        checkStatus: (args) => rpc('check_license_status', args),
        verifyLegacy: (args) => rpc('check_and_use_license', args)
    };
}

module.exports = { createSupabaseLicenseApi };
