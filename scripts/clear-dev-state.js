#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { spawnSync } = require('node:child_process');
const { machineIdSync } = require('node-machine-id');
const { parseEnvironmentFile } = require('./project-environment');

const MUTABLE_CONFIG_NAMES = Object.freeze([
    'config.json',
    'auth.json',
    'naver_auth.json',
    'google_oauth_tokens.json',
    'writing_profile.json',
    'continuous_publishing.json'
]);
const LICENSE_FILE_NAMES = Object.freeze([
    'license.local.key',
    'license.development.key',
    'license.key'
]);
const ROOT_TRANSIENT_NAMES = Object.freeze([
    'data',
    'logs',
    'tmp_update',
    'update-state',
    '.tmp'
]);
const PRESERVED_USER_DATA_NAMES = new Set(['BlogGenius', 'crashes', 'diagnostics', 'logs']);

function usage() {
    return `BlogGenius Development 초기화

사용법:
  ./clear_dev.sh [옵션]

옵션을 생략하면 full/no-full과 Development 사용자 초기화 여부를 묻고
삭제 예정 목록을 보여줍니다. 마지막 삭제 확인에서 Enter를 누르면
--no-full --local-only --dry-run과 같은 결과가 됩니다.
실제 삭제에는 --apply가 필요합니다.

옵션:
  --full       최초 설치 재현을 위해 로컬 사용자 상태를 전체 초기화합니다.
  --no-full    설정과 브라우저 상태만 초기화합니다. (기본값)
  --reset-development-user
               Development Supabase의 현재 테스트 사용자 상태도 초기화합니다.
               --full과 함께 사용해야 하며 별도 확인 문구가 필요합니다.
  --local-only Supabase에는 접근하지 않습니다. (기본값)
  --apply       표시된 로컬 항목을 실제로 삭제합니다.
  --dry-run     삭제 대상을 보여주기만 합니다. (기본값)
  --yes         로컬 삭제 확인 질문을 생략합니다.
               원격 사용자 삭제 확인은 생략하지 않습니다.
  --help, -h    이 도움말을 표시합니다.

예시:
  ./clear_dev.sh
      부분·로컬 초기화 대상 미리보기
  ./clear_dev.sh --apply
      확인 후 부분·로컬 초기화
  ./clear_dev.sh --full
      최초 설치용 전체·로컬 초기화 대상 미리보기
  ./clear_dev.sh --full --apply
      확인 후 전체·로컬 초기화
  ./clear_dev.sh --full --reset-development-user
      로컬과 Development 사용자 초기화 대상 미리보기
  ./clear_dev.sh --full --reset-development-user --apply
      신규 사용자 전체 흐름 재현

보존 항목:
  - 사용자가 만든 backup·원고·임의 파일
  - 소스, sample 설정, .env.*, 개발 secret
  - OS 진단 영역의 crash dump, diagnostics, bootstrap/launcher 자료
  - 모든 Production 및 공유 Supabase 데이터
`;
}

function parseArgs(argv) {
    const result = {
        mode: 'partial',
        apply: false,
        yes: false,
        help: false,
        resetDevelopmentUser: false,
        modeExplicit: false,
        remoteExplicit: false,
        actionExplicit: false
    };
    for (const arg of argv) {
        if (arg === '--full') {
            result.mode = 'full';
            result.modeExplicit = true;
        } else if (arg === '--no-full') {
            result.mode = 'partial';
            result.modeExplicit = true;
        } else if (arg === '--local-only') {
            result.resetDevelopmentUser = false;
            result.remoteExplicit = true;
        }
        if (arg === '--apply') {
            result.apply = true;
            result.actionExplicit = true;
        }
        else if (arg === '--dry-run') {
            result.apply = false;
            result.actionExplicit = true;
        }
        else if (arg === '--yes') result.yes = true;
        else if (arg === '--help' || arg === '-h') result.help = true;
        else if (arg === '--reset-development-user') {
            result.resetDevelopmentUser = true;
            result.remoteExplicit = true;
        }
        else if (arg === '--full' || arg === '--no-full' || arg === '--local-only') { }
        else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }
    if (result.mode !== 'full' && result.resetDevelopmentUser) {
        throw new Error('--reset-development-user는 --full과 함께 사용해야 합니다.');
    }
    return result;
}

async function selectInteractiveScope(args, input = process.stdin, output = process.stdout) {
    const missingScope = !args.modeExplicit || (args.mode === 'full' && !args.remoteExplicit);
    if (!input.isTTY && (missingScope || !args.actionExplicit)) {
        throw new Error('비대화형 실행에서는 --full/--no-full, --reset-development-user/--local-only, --apply/--dry-run을 모두 지정해 주세요.');
    }
    if (!missingScope) return args;
    const selected = { ...args };
    const rl = readline.createInterface({ input, output });
    try {
        if (!selected.modeExplicit) {
            const answer = await rl.question('최초 설치 상태처럼 전체 초기화할까요? [y/N] ');
            selected.mode = /^y(?:es)?$/i.test(answer.trim()) ? 'full' : 'partial';
        }
        if (selected.mode === 'full' && !selected.remoteExplicit) {
            const answer = await rl.question('Development Supabase의 현재 테스트 사용자도 초기화할까요? [y/N] ');
            selected.resetDevelopmentUser = /^y(?:es)?$/i.test(answer.trim());
        }
        return selected;
    } finally {
        rl.close();
    }
}

function resolveElectronUserData(options = {}) {
    const platform = options.platform || process.platform;
    const homeDir = path.resolve(options.homeDir || os.homedir());
    if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'blog-genius');
    if (platform === 'linux') {
        const configHome = String(options.env?.XDG_CONFIG_HOME || process.env.XDG_CONFIG_HOME || '').trim();
        return path.join(configHome ? path.resolve(configHome) : path.join(homeDir, '.config'), 'blog-genius');
    }
    throw new Error('현재 .sh 초기화 도구는 macOS와 Linux만 지원합니다. Windows는 후속 .ps1을 사용해 주세요.');
}

function readJson(filePath, fsImpl = fs) {
    try {
        return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    } catch (_error) {
        return null;
    }
}

function resolveWorkspace(repoRoot, fsImpl = fs) {
    const config = readJson(path.join(repoRoot, 'config', 'config.json'), fsImpl);
    const configured = String(config?.general?.workspace_dir || '').trim();
    return configured ? path.resolve(repoRoot, configured) : path.join(repoRoot, 'workspace');
}

function isSafeDeletionTarget(target, { repoRoot, homeDir }) {
    const resolved = path.resolve(target);
    const forbidden = new Set([
        path.parse(resolved).root,
        path.resolve(homeDir),
        path.resolve(repoRoot),
        path.dirname(path.resolve(repoRoot))
    ]);
    return !forbidden.has(resolved) && resolved.split(path.sep).filter(Boolean).length >= 3;
}

function listMutableConfigTargets(repoRoot, { includeLicenses = false, fsImpl = fs } = {}) {
    const configDir = path.join(repoRoot, 'config');
    if (!fsImpl.existsSync(configDir)) return [];
    const names = new Set([...MUTABLE_CONFIG_NAMES, ...(includeLicenses ? LICENSE_FILE_NAMES : [])]);
    return fsImpl.readdirSync(configDir)
        .filter((name) => names.has(name)
            || /^continuous_publishing\.json\..+\.tmp$/i.test(name))
        .map((name) => path.join(configDir, name));
}

function listManagedWorkspaceTargets(workspaceRoot, fsImpl = fs) {
    if (!fsImpl.existsSync(workspaceRoot)) return [];
    return fsImpl.readdirSync(workspaceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && (
            entry.name === 'manuscript-drafts'
            || entry.name === 'card-news'
            || entry.name.startsWith('naver_')
            || entry.name.startsWith('wp_')
        ))
        .map((entry) => path.join(workspaceRoot, entry.name));
}

function listUserDataTargets(userDataDir, { preserveLicenses, fsImpl = fs } = {}) {
    if (!fsImpl.existsSync(userDataDir)) return [];
    const targets = [];
    for (const entry of fsImpl.readdirSync(userDataDir, { withFileTypes: true })) {
        if (PRESERVED_USER_DATA_NAMES.has(entry.name)) continue;
        const entryPath = path.join(userDataDir, entry.name);
        if (entry.name === 'config' && entry.isDirectory()) {
            const managedNames = new Set([
                ...MUTABLE_CONFIG_NAMES,
                ...(!preserveLicenses ? LICENSE_FILE_NAMES : [])
            ]);
            for (const configEntry of fsImpl.readdirSync(entryPath, { withFileTypes: true })) {
                if (managedNames.has(configEntry.name)
                    || /^continuous_publishing\.json\..+\.tmp$/i.test(configEntry.name)) {
                    targets.push(path.join(entryPath, configEntry.name));
                }
            }
            continue;
        }
        targets.push(entryPath);
    }
    return targets;
}

function buildPlan(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const homeDir = path.resolve(options.homeDir || os.homedir());
    const fsImpl = options.fsImpl || fs;
    const userDataDir = options.userDataDir || resolveElectronUserData({
        platform: options.platform,
        homeDir,
        env: options.env
    });
    const full = options.mode === 'full';
    const targets = listMutableConfigTargets(repoRoot, { includeLicenses: full, fsImpl });

    if (full) {
        for (const name of ROOT_TRANSIENT_NAMES) targets.push(path.join(repoRoot, name));
        targets.push(...listManagedWorkspaceTargets(path.join(repoRoot, 'workspace'), fsImpl));
        targets.push(...listManagedWorkspaceTargets(resolveWorkspace(repoRoot, fsImpl), fsImpl));
    }
    targets.push(...listUserDataTargets(userDataDir, { preserveLicenses: !full, fsImpl }));

    const uniqueTargets = [...new Set(targets.map((target) => path.resolve(target)))]
        .filter((target) => fsImpl.existsSync(target));
    for (const target of uniqueTargets) {
        if (!isSafeDeletionTarget(target, { repoRoot, homeDir })) {
            throw new Error(`안전하지 않은 삭제 경로를 거부했습니다: ${target}`);
        }
    }
    return { repoRoot, homeDir, userDataDir, targets: uniqueTargets };
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function measurePath(target, fsImpl = fs) {
    let stat;
    try { stat = fsImpl.lstatSync(target); } catch (_error) { return 0; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size;
    let total = 0;
    for (const name of fsImpl.readdirSync(target)) total += measurePath(path.join(target, name), fsImpl);
    return total;
}

function displayPlan(plan, mode, output = process.stdout) {
    output.write(`\n[${mode === 'full' ? '전체' : '부분'} 초기화] 삭제 대상\n`);
    if (plan.targets.length === 0) output.write('  삭제할 로컬 상태가 없습니다.\n');
    const electronTemporary = plan.targets.filter((target) => (
        path.dirname(target) === plan.userDataDir
        && path.basename(target).startsWith('.com.github.Electron.')
    ));
    const visibleTargets = plan.targets.filter((target) => !electronTemporary.includes(target));
    for (const target of visibleTargets) output.write(`  - ${target} (${formatBytes(measurePath(target))})\n`);
    if (electronTemporary.length > 0) {
        const bytes = electronTemporary.reduce((total, target) => total + measurePath(target), 0);
        output.write(`  - ${path.join(plan.userDataDir, '.com.github.Electron.*')} (${electronTemporary.length}개, ${formatBytes(bytes)})\n`);
    }
    output.write(`\nElectron userData: ${plan.userDataDir}\n`);
    output.write('보존: 사용자 backup·임의 파일, BlogGenius crash/diagnostics, sample, .env.*, 소스, 원격 공유 데이터\n');
}

function assertAppStopped(spawn = spawnSync) {
    if (process.platform === 'win32') return;
    const result = spawn('pgrep', ['-fl', 'BlogGenius.app|BlogGeniusLauncher|electron.*NaverAutoBlog'], {
        encoding: 'utf8'
    });
    if (result.status === 0 && String(result.stdout || '').trim()) {
        throw new Error('BlogGenius가 실행 중입니다. 앱을 종료한 뒤 다시 실행해 주세요.');
    }
}

function removeTargets(targets, fsImpl = fs) {
    for (const target of targets) fsImpl.rmSync(target, { recursive: true, force: true });
}

function readFirstLine(filePath, fsImpl = fs) {
    try {
        return String(fsImpl.readFileSync(filePath, 'utf8')).split(/\r?\n/).find((line) => line.trim())?.trim() || '';
    } catch (_error) {
        return '';
    }
}

function loadEnvironmentFile(repoRoot, fileName, fsImpl = fs) {
    const filePath = path.join(repoRoot, fileName);
    return fsImpl.existsSync(filePath)
        ? parseEnvironmentFile(fsImpl.readFileSync(filePath, 'utf8'))
        : {};
}

function validateDevelopmentDatabase(repoRoot, env = process.env, fsImpl = fs) {
    const development = { ...loadEnvironmentFile(repoRoot, '.env.development', fsImpl), ...env };
    const production = { ...loadEnvironmentFile(repoRoot, '.env.production', fsImpl), ...env };
    const projectRef = String(development.BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF || '').trim();
    const publicUrl = String(development.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL || '').trim();
    const dbUrl = String(development.BLOGGENIUS_DEVELOPMENT_SUPABASE_DB_URL || '').trim();
    const productionRef = String(production.BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF || '').trim();
    const productionUrl = String(production.BLOGGENIUS_PRODUCTION_SUPABASE_URL || '').trim();
    if (!projectRef || !publicUrl || !dbUrl) throw new Error('.env.development의 Development Supabase 연결 정보가 부족합니다.');
    if (projectRef === productionRef || publicUrl === productionUrl) throw new Error('Production과 같은 Supabase 대상이므로 원격 초기화를 거부했습니다.');

    let parsedPublic;
    let parsedDb;
    try {
        parsedPublic = new URL(publicUrl);
        parsedDb = new URL(dbUrl);
    } catch (_error) {
        throw new Error('Development Supabase URL 또는 DB URL 형식이 올바르지 않습니다.');
    }
    if (parsedPublic.protocol !== 'https:' || parsedPublic.hostname !== `${projectRef}.supabase.co`) {
        throw new Error('Development project ref와 공개 URL이 일치하지 않습니다.');
    }
    if (!['postgres:', 'postgresql:'].includes(parsedDb.protocol)) throw new Error('Development DB URL은 PostgreSQL 연결이어야 합니다.');
    const dbIdentity = `${parsedDb.hostname} ${decodeURIComponent(parsedDb.username)}`;
    if (!dbIdentity.includes(projectRef)) throw new Error('Development project ref와 DB URL 대상이 일치하지 않습니다.');
    return { projectRef, dbUrl };
}

function resolveDevelopmentIdentity(repoRoot, userDataDir, fsImpl = fs) {
    const candidates = [
        path.join(userDataDir, 'config', 'license.development.key'),
        path.join(repoRoot, 'config', 'license.development.key')
    ].map((filePath) => readFirstLine(filePath, fsImpl)).filter(Boolean);
    const keys = [...new Set(candidates)];
    if (keys.length !== 1) {
        throw new Error(keys.length === 0
            ? 'Development 라이선스 키를 찾지 못했습니다. 로컬 파일을 지우기 전에 다시 시도해 주세요.'
            : '서로 다른 Development 라이선스 키가 발견되어 사용자를 안전하게 특정할 수 없습니다.');
    }
    const hwid = String(machineIdSync({ original: true }) || '').trim();
    if (!hwid) throw new Error('현재 기기의 HWID를 확인하지 못했습니다.');
    return { licenseKey: keys[0], hwid };
}

function sqlLiteral(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function buildDevelopmentResetSql(identity, apply) {
    const licenseHashHex = crypto.createHash('sha256').update(identity.licenseKey, 'utf8').digest('hex');
    const licenseHashBase64Url = crypto.createHash('sha256').update(identity.licenseKey, 'utf8').digest('base64url');
    const hwidHash = crypto.createHash('sha256').update(identity.hwid, 'utf8').digest('hex');
    const lockClause = apply ? ' for update' : '';
    const deleteStatements = apply ? `
    delete from public.license_registration_codes
     where lower(email) in (
         select lower(email) from public.licenses
          where hwid = ${sqlLiteral(identity.hwid)} and email is not null
     );
    delete from public.keyword_research_rate_limits where subject_hash = ${sqlLiteral(licenseHashBase64Url)};
    delete from public.knowledge_gateway_rate_limits where subject_hash = ${sqlLiteral(licenseHashHex)};
    delete from public.licenses where hwid = ${sqlLiteral(identity.hwid)};
    delete from public.license_device_states where hwid_hash = ${sqlLiteral(hwidHash)};
` : '';
    return `do $reset$
declare
    v_license public.licenses%rowtype;
    v_license_count integer := 0;
    v_publish_operation_count integer := 0;
    v_smart_session_count integer := 0;
    v_smart_operation_count integer := 0;
    v_registration_code_count integer := 0;
    v_device_state_count integer := 0;
    v_keyword_rate_count integer := 0;
    v_gateway_rate_count integer := 0;
begin
    select * into v_license from public.licenses where license_key = ${sqlLiteral(identity.licenseKey)}${lockClause};
    if not found then raise exception 'development license not found'; end if;
    if coalesce(v_license.hwid, '') <> ${sqlLiteral(identity.hwid)} then
        raise exception 'development license HWID does not match this machine';
    end if;
    select count(*) into v_license_count from public.licenses where hwid = ${sqlLiteral(identity.hwid)};
    select count(*) into v_publish_operation_count
      from public.license_usage_operations o join public.licenses l on l.id = o.license_id
     where l.hwid = ${sqlLiteral(identity.hwid)};
    select count(*) into v_smart_session_count
      from public.license_capability_usage_sessions s join public.licenses l on l.id = s.license_id
     where l.hwid = ${sqlLiteral(identity.hwid)};
    select count(*) into v_smart_operation_count
      from public.license_capability_usage_operations o join public.licenses l on l.id = o.license_id
     where l.hwid = ${sqlLiteral(identity.hwid)};
    select count(*) into v_registration_code_count from public.license_registration_codes
     where lower(email) in (
         select lower(email) from public.licenses
          where hwid = ${sqlLiteral(identity.hwid)} and email is not null
     );
    select count(*) into v_device_state_count from public.license_device_states where hwid_hash = ${sqlLiteral(hwidHash)};
    select count(*) into v_keyword_rate_count from public.keyword_research_rate_limits where subject_hash = ${sqlLiteral(licenseHashBase64Url)};
    select count(*) into v_gateway_rate_count from public.knowledge_gateway_rate_limits where subject_hash = ${sqlLiteral(licenseHashHex)};
    raise notice 'matched development user: licenses=%, publish_operations=%, smart_sessions=%, smart_operations=%, registration_codes=%, device_states=%, keyword_rate_limits=%, gateway_rate_limits=%',
        v_license_count, v_publish_operation_count, v_smart_session_count, v_smart_operation_count,
        v_registration_code_count, v_device_state_count, v_keyword_rate_count, v_gateway_rate_count;

${deleteStatements}
end
$reset$;
`;
}

function runDevelopmentReset({ repoRoot, userDataDir, apply, env = process.env, spawn = spawnSync, fsImpl = fs }) {
    const connection = validateDevelopmentDatabase(repoRoot, env, fsImpl);
    const identity = resolveDevelopmentIdentity(repoRoot, userDataDir, fsImpl);
    const tempDir = fsImpl.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-development-reset-'));
    const sqlPath = path.join(tempDir, 'reset.sql');
    try {
        fsImpl.writeFileSync(sqlPath, buildDevelopmentResetSql(identity, apply), { mode: 0o600 });
        const result = spawn('supabase', ['db', 'query', '--db-url', connection.dbUrl, '--file', sqlPath], {
            cwd: repoRoot,
            env,
            encoding: 'utf8',
            stdio: 'inherit'
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Development 사용자 ${apply ? '초기화' : '조회'}가 실패했습니다. (exit ${result.status})`);
        return connection.projectRef;
    } finally {
        fsImpl.rmSync(tempDir, { recursive: true, force: true });
    }
}

async function confirmLocal(mode, input = process.stdin, output = process.stdout) {
    const rl = readline.createInterface({ input, output });
    try {
        const label = mode === 'full' ? '위의 전체 초기화 대상' : '위의 부분 초기화 대상';
        const answer = await rl.question(`${label}을 실제로 지울까요? [y/N] `);
        return /^y(?:es)?$/i.test(answer.trim());
    } finally {
        rl.close();
    }
}

async function confirmRemote(projectRef, input = process.stdin, output = process.stdout) {
    const expected = `RESET DEVELOPMENT USER ${projectRef}`;
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question(`Development 사용자 데이터를 삭제하려면 다음 문구를 입력하세요.\n${expected}\n> `);
        return answer.trim() === expected;
    } finally {
        rl.close();
    }
}

async function main(argv = process.argv.slice(2)) {
    let args = parseArgs(argv);
    if (args.help) {
        process.stdout.write(usage());
        return;
    }
    args = await selectInteractiveScope(args);
    const plan = buildPlan({ mode: args.mode });
    displayPlan(plan, args.mode);

    let remoteProjectRef = '';
    if (args.resetDevelopmentUser) {
        remoteProjectRef = validateDevelopmentDatabase(plan.repoRoot).projectRef;
        resolveDevelopmentIdentity(plan.repoRoot, plan.userDataDir);
        process.stdout.write(`원격 대상: Development Supabase ${remoteProjectRef}의 현재 기기 테스트 사용자\n`);
        runDevelopmentReset({ ...plan, apply: false });
    }
    if (!args.actionExplicit) {
        args.apply = await confirmLocal(args.mode);
    } else if (args.apply && !args.yes) {
        args.apply = await confirmLocal(args.mode);
    }
    if (!args.apply) {
        process.stdout.write('\n삭제하지 않았습니다. 비대화형 실제 실행에는 --apply를 사용하세요.\n');
        return;
    }

    assertAppStopped();
    if (args.resetDevelopmentUser) {
        if (!(await confirmRemote(remoteProjectRef))) throw new Error('Development 사용자 초기화를 취소했습니다.');
        runDevelopmentReset({ ...plan, apply: true });
    }
    removeTargets(plan.targets);
    process.stdout.write(`\n${args.mode === 'full' ? '전체' : '부분'} 초기화를 완료했습니다.\n`);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`초기화 실패: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    MUTABLE_CONFIG_NAMES,
    LICENSE_FILE_NAMES,
    PRESERVED_USER_DATA_NAMES,
    usage,
    parseArgs,
    selectInteractiveScope,
    resolveElectronUserData,
    resolveWorkspace,
    isSafeDeletionTarget,
    listMutableConfigTargets,
    listManagedWorkspaceTargets,
    listUserDataTargets,
    buildPlan,
    validateDevelopmentDatabase,
    resolveDevelopmentIdentity,
    buildDevelopmentResetSql,
    removeTargets
};
