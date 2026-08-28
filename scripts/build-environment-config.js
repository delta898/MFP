#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    assertEnvironmentName
} = require('../src/environment/contract');
const {
    validatePublicUrl
} = require('../src/environment/runtime-profile');

function normalizeText(value) {
    return String(value || '').trim();
}

function createBuildEnvironmentConfig(input = {}) {
    const environment = assertEnvironmentName(input.environment);
    const supabaseUrl = normalizeText(input.supabaseUrl);
    const publishableKey = normalizeText(input.publishableKey);
    const googleOauthClientId = normalizeText(input.googleOauthClientId);
    const googleOauthClientSecret = normalizeText(input.googleOauthClientSecret);
    const validatedUrl = validatePublicUrl(environment, supabaseUrl);

    if (!validatedUrl.valid) {
        throw new Error(`Invalid ${environment} Supabase URL: ${validatedUrl.reason}`);
    }
    if (!publishableKey) {
        throw new Error(`Missing ${environment} Supabase publishable key`);
    }
    if (!googleOauthClientId || !googleOauthClientSecret) {
        throw new Error(`Missing ${environment} Google OAuth client configuration`);
    }

    return Object.freeze({
        BLOGGENIUS_ENV: environment,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
        GOOGLE_OAUTH_CLIENT_ID: googleOauthClientId,
        GOOGLE_OAUTH_CLIENT_SECRET: googleOauthClientSecret
    });
}

function serializeBuildEnvironmentConfig(config) {
    return `'use strict';\n\nmodule.exports = Object.freeze(${JSON.stringify(config, null, 4)});\n`;
}

function writeBuildEnvironmentConfig(outputPath, config, fsImpl = fs) {
    const target = path.resolve(outputPath);
    fsImpl.mkdirSync(path.dirname(target), { recursive: true });
    fsImpl.writeFileSync(target, serializeBuildEnvironmentConfig(config), {
        encoding: 'utf8',
        mode: 0o600
    });
    return target;
}

function validateBuildEnvironmentConfig(config, expectedEnvironment) {
    const expected = assertEnvironmentName(expectedEnvironment);
    const normalized = createBuildEnvironmentConfig({
        environment: config?.BLOGGENIUS_ENV,
        supabaseUrl: config?.SUPABASE_URL,
        publishableKey: config?.SUPABASE_PUBLISHABLE_KEY,
        googleOauthClientId: config?.GOOGLE_OAUTH_CLIENT_ID,
        googleOauthClientSecret: config?.GOOGLE_OAUTH_CLIENT_SECRET
    });
    if (normalized.BLOGGENIUS_ENV !== expected) {
        throw new Error(
            `Build environment mismatch: expected ${expected}, got ${normalized.BLOGGENIUS_ENV}`
        );
    }
    return normalized;
}

function parseArgs(argv) {
    const result = { command: '', target: '', input: '', output: '' };
    const args = [...argv];
    result.command = normalizeText(args.shift());
    for (let index = 0; index < args.length; index += 1) {
        const arg = normalizeText(args[index]);
        if (arg === '--target') result.target = normalizeText(args[++index]);
        else if (arg === '--input') result.input = normalizeText(args[++index]);
        else if (arg === '--output') result.output = normalizeText(args[++index]);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return result;
}

function runCli(argv = process.argv.slice(2), env = process.env) {
    const args = parseArgs(argv);
    if (args.command === 'write') {
        if (!args.target || !args.output) throw new Error('write requires --target and --output');
        const config = createBuildEnvironmentConfig({
            environment: args.target,
            supabaseUrl: env.BLOGGENIUS_BUILD_SUPABASE_URL,
            publishableKey: env.BLOGGENIUS_BUILD_SUPABASE_PUBLISHABLE_KEY,
            googleOauthClientId: env.BLOGGENIUS_BUILD_GOOGLE_OAUTH_CLIENT_ID,
            googleOauthClientSecret: env.BLOGGENIUS_BUILD_GOOGLE_OAUTH_CLIENT_SECRET
        });
        writeBuildEnvironmentConfig(args.output, config);
        process.stdout.write(`Build environment config created for ${config.BLOGGENIUS_ENV}.\n`);
        return 0;
    }

    if (args.command === 'validate') {
        if (!args.target || !args.input) throw new Error('validate requires --target and --input');
        const inputPath = path.resolve(args.input);
        if (!fs.existsSync(inputPath)) throw new Error(`Build environment config not found: ${args.input}`);
        delete require.cache[require.resolve(inputPath)];
        const config = require(inputPath);
        const validated = validateBuildEnvironmentConfig(config, args.target);
        process.stdout.write(`Build environment config is valid for ${validated.BLOGGENIUS_ENV}.\n`);
        return 0;
    }

    throw new Error('Expected command: write or validate');
}

if (require.main === module) {
    try {
        process.exitCode = runCli();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    createBuildEnvironmentConfig,
    serializeBuildEnvironmentConfig,
    writeBuildEnvironmentConfig,
    validateBuildEnvironmentConfig,
    parseArgs,
    runCli
};
