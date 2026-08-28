#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseLocalSupabaseStatus } = require('./app-environment-launcher');
const { loadDevelopmentEnvironment } = require('./project-environment');
const {
    loadManifest,
    inspectHostedDevelopmentReadiness
} = require('./hosted-development-readiness');

function safeHost(rawUrl) {
    try {
        return new URL(String(rawUrl || '')).host;
    } catch (_error) {
        return '';
    }
}

function inspectLocalEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const result = spawn('supabase', ['status', '--output', 'json'], {
        cwd: repoRoot,
        env: options.env || process.env,
        encoding: 'utf8',
        timeout: options.localTimeoutMs || 5000
    });
    if (result.error) {
        return Object.freeze({
            ready: false,
            state: result.error.code === 'ETIMEDOUT' ? 'status_timeout' : 'cli_unavailable',
            host: ''
        });
    }
    if (result.status !== 0) {
        return Object.freeze({
            ready: false,
            state: 'stopped',
            host: ''
        });
    }
    try {
        const status = parseLocalSupabaseStatus(result.stdout);
        return Object.freeze({
            ready: true,
            state: 'running',
            host: safeHost(status.url)
        });
    } catch (_error) {
        return Object.freeze({
            ready: false,
            state: 'invalid_status',
            host: ''
        });
    }
}

function inspectDevelopmentEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = loadDevelopmentEnvironment({
        repoRoot,
        fs: options.fs,
        env: options.env || process.env
    });
    const manifest = options.manifest || loadManifest(repoRoot, options.fs);
    const readiness = inspectHostedDevelopmentReadiness({
        repoRoot,
        fs: options.fs,
        env,
        manifest
    });
    return Object.freeze({
        ready: readiness.ready,
        state: readiness.ready ? 'configured' : 'configuration_required',
        host: safeHost(readiness.project.url),
        missingSources: readiness.project.missingSources,
        policyViolations: readiness.policyViolations
    });
}

function inspectEnvironmentStatus(options = {}) {
    return Object.freeze({
        local: inspectLocalEnvironment(options),
        development: inspectDevelopmentEnvironment(options),
        production: Object.freeze({
            ready: false,
            state: 'release_only'
        })
    });
}

function formatEnvironmentStatus(status) {
    const localState = {
        running: '실행 중',
        stopped: '중지됨',
        cli_unavailable: 'Supabase CLI 확인 필요',
        status_timeout: '상태 확인 시간 초과',
        invalid_status: '상태 확인 실패'
    }[status.local.state] || status.local.state;
    const developmentState = status.development.ready ? '설정 완료' : '설정 필요';
    const lines = [
        'BlogGenius 개발 환경 상태',
        '',
        `Local: ${localState}${status.local.host ? ` (${status.local.host})` : ''}`,
        '  실행: npm run app:local',
        `Development: ${developmentState}${status.development.host ? ` (${status.development.host})` : ''}`,
        '  실행: npm run app:development',
        'Production: 개발 명령으로 선택할 수 없음 (릴리즈 승인 경로 전용)'
    ];
    if (status.development.missingSources.length) {
        lines.push(`  누락 설정: ${status.development.missingSources.join(', ')}`);
    }
    if (status.development.policyViolations.length) {
        lines.push(`  정책 위반: ${status.development.policyViolations.join(', ')}`);
    }
    lines.push('', '환경은 저장된 현재값이 아니라 앱 실행 명령으로 선택합니다.');
    return `${lines.join('\n')}\n`;
}

if (require.main === module) {
    try {
        process.stdout.write(formatEnvironmentStatus(inspectEnvironmentStatus()));
    } catch (error) {
        process.stderr.write(`BlogGenius environment status failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    safeHost,
    inspectLocalEnvironment,
    inspectDevelopmentEnvironment,
    inspectEnvironmentStatus,
    formatEnvironmentStatus
};
