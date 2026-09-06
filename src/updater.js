const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { spawn } = require('child_process');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { APP_VERSION } = require('./constants');

/**
 * Updater Module
 * Handles version checking and full folder self-updating from a public GitHub mirror repository.
 */
class Updater {
    constructor(options = {}) {
        this.currentVersion = APP_VERSION;
        this.appRootDir = options.appRootDir || CONFIG.APP_ROOT_DIR;
        this.tempDir = path.join(this.appRootDir, CONFIG.UPDATE_TEMP_DIR || 'tmp_update');
        this.platform = options.platform || process.platform;
        this.arch = options.arch || process.arch;
        this.spawnProcess = options.spawnProcess || spawn;
        this.exitProcess = options.exitProcess || ((code) => process.exit(code));
        this.executablePath = options.executablePath || process.execPath;
        this.fs = options.fs || fs;
        this.env = options.env || process.env;
        this.userDataDir = options.userDataDir
            || String(this.env.BLOG_GENIUS_USER_DATA || '').trim()
            || this.appRootDir;
        this.updateCompletionReceiptPath = options.updateCompletionReceiptPath
            || path.join(this.userDataDir, 'update-state', 'completion.json');
        this.windowsHelperReadyTimeoutMs = options.windowsHelperReadyTimeoutMs || 5000;
        this.windowsPowerShellCandidates = options.windowsPowerShellCandidates || null;
        this.isUpdating = false;
        this.lastCheck = 0;
        this.updateInfo = null;
        this.lastCheckWasForced = false;
        this.lastUpdateSourceKey = '';

        // 보존할 대상 (업데이트 시 절대 건드리지 않음)
        this.preserveList = ['config', 'logs', 'data', 'workspace', 'tmp_update', '.git', '.DS_Store'];

        // 업데이트 진행 상태 (UI 폴링용)
        this.progress = {
            active: false,
            stage: 'idle',
            message: '',
            percent: 0,
            totalSize: 0,
            downloadedSize: 0
        };

        // 다운로드 취소용 AbortController
        this._cancelController = null;
        this._pendingExternalRestart = null;
    }

    getUpdateServerType() {
        return String(CONFIG.UPDATE_SERVER_TYPE || 'github').trim() === 'custom' ? 'custom' : 'github';
    }

    getUpdateMirrorRepo() {
        return String(CONFIG.UPDATE_MIRROR_REPO || CONFIG.DEFAULT_UPDATE_MIRROR_REPO || '').trim();
    }

    normalizeUpdateDetails(release = {}) {
        const body = String(release?.body || '').trim();
        const provided = release?.details && typeof release.details === 'object' ? release.details : null;
        const summary = String(provided?.summary || '').trim();
        const highlights = Array.isArray(provided?.highlights)
            ? provided.highlights.map(item => String(item || '').trim()).filter(Boolean)
            : [];
        const normalizedSummary = summary || highlights[0] || this.extractBodySummary(body) || '';
        const normalizedHighlights = highlights.length > 0 ? highlights : this.extractBodyHighlights(body);
        const url = String(provided?.url || release?.html_url || '').trim();

        return {
            summary: normalizedSummary,
            highlights: normalizedHighlights,
            url
        };
    }

    extractBodySummary(body = '') {
        const raw = String(body || '');
        const firstLine = raw.split('\n').map(line => line.trim()).find(Boolean) || '';
        return firstLine.replace(/^[-*]\s*/, '').trim();
    }

    extractBodyHighlights(body = '') {
        return String(body || '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => /^[-*]\s+/.test(line))
            .map(line => line.replace(/^[-*]\s+/, '').trim())
            .filter(Boolean)
            .slice(0, 5);
    }

    getCustomManifestUrl() {
        const raw = String(CONFIG.CUSTOM_UPDATE_CHECK_URL || '').trim();
        if (!raw) return '';
        if (/\.json(\?.*)?$/i.test(raw)) return raw;
        return `${raw.replace(/\/+$/, '')}/update.json`;
    }

    getUpdateSourceKey() {
        return JSON.stringify({
            type: this.getUpdateServerType(),
            manifestUrl: this.getCustomManifestUrl(),
            repo: this.getUpdateMirrorRepo(),
            channel: String(CONFIG.UPDATE_CHANNEL || '').trim().toLowerCase(),
            role: String(CONFIG.USER_ROLE || '').trim().toLowerCase()
        });
    }

    async fetchReleases() {
        const customManifestUrl = this.getCustomManifestUrl();
        if (this.getUpdateServerType() === 'custom' && customManifestUrl) {
            Logger.debug(`📂 [Updater] 커스텀 서버에서 업데이트 체크: ${customManifestUrl}`);
            const response = await axios.get(customManifestUrl, {
                timeout: 5000
            });
            return Array.isArray(response.data) ? response.data : [response.data];
        }

        const url = `https://api.github.com/repos/${this.getUpdateMirrorRepo()}/releases`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'BlogGenius-Updater' },
            timeout: 5000
        });
        return Array.isArray(response.data) ? response.data : [];
    }

    async enrichReleaseWithManifest(release = null) {
        if (!release || typeof release !== 'object') return release;
        if (this.getUpdateServerType() !== 'github') return release;

        const manifestAsset = Array.isArray(release.assets)
            ? release.assets.find((asset) => String(asset?.name || '').trim().toLowerCase() === 'update.json')
            : null;
        if (!manifestAsset?.browser_download_url) {
            return release;
        }

        try {
            Logger.debug(`📂 [Updater] release asset update.json 로드: ${manifestAsset.browser_download_url}`);
            const response = await axios.get(manifestAsset.browser_download_url, {
                headers: { 'User-Agent': 'BlogGenius-Updater' },
                timeout: 5000
            });
            const manifest = response?.data;
            if (!manifest || typeof manifest !== 'object') {
                return release;
            }

            const merged = {
                ...release,
                tag_name: String(manifest.tag_name || release.tag_name || '').trim() || release.tag_name,
                published_at: String(manifest.published_at || release.published_at || '').trim() || release.published_at,
                prerelease: typeof manifest.prerelease === 'boolean' ? manifest.prerelease : release.prerelease,
                body: String(manifest.body || release.body || '').trim() || release.body,
                details: manifest.details && typeof manifest.details === 'object'
                    ? { ...manifest.details, url: String(manifest.details.url || release.html_url || '').trim() }
                    : release.details,
                assets: Array.isArray(manifest.assets) && manifest.assets.length > 0
                    ? manifest.assets.map((asset) => ({ ...asset }))
                    : release.assets,
                html_url: release.html_url
            };
            Logger.debug(`✅ [Updater] update.json 메타데이터 병합 완료: ${merged.tag_name}`);
            return merged;
        } catch (error) {
            Logger.warn(`⚠️ [Updater] release asset update.json 로드 실패: ${error.message}`);
            return release;
        }
    }

    selectReleaseForChannel(releases = [], userRole = 'User') {
        if (!Array.isArray(releases) || releases.length === 0) return null;

        const sorted = [...releases].sort((a, b) => this.compareVersions(b.tag_name, a.tag_name));

        let channel = String(CONFIG.UPDATE_CHANNEL || '').trim().toLowerCase();
        if (!channel) {
            const role = String(userRole || 'User').trim().toLowerCase();
            if (role === 'developer') channel = 'dev';
            else if (role === 'tester') channel = 'beta';
            else channel = 'stable';
        }

        if (channel === 'dev') {
            return sorted[0];
        }

        if (channel === 'beta') {
            return sorted.find(r =>
                !r.prerelease ||
                (r.tag_name.toLowerCase().includes('beta') || r.tag_name.toLowerCase().includes('rc')) &&
                !r.tag_name.toLowerCase().includes('alpha') && !r.tag_name.toLowerCase().includes('dev')
            ) || null;
        }

        return sorted.find(r => !r.prerelease) || null;
    }

    /**
     * Get the latest release information from the server (GitHub or Custom)
     */
    async getLatestRelease(userRole = 'User') {
        try {
            const releases = await this.fetchReleases();

            if (releases.length === 0 || !releases[0]) return null;
            const selected = this.selectReleaseForChannel(releases, userRole);
            return this.enrichReleaseWithManifest(selected);
        } catch (e) {
            Logger.error(`❌ [Updater] 버전 체크 실패: ${e.message}`);
            return null;
        }
    }

    /**
     * Check if a new version is available
     * @param {Object} options - { force: boolean }
     */
    async checkForUpdate(options = {}) {
        const force = options.force === true;
        const now = Date.now();
        const updateSourceKey = this.getUpdateSourceKey();
        if (this.lastUpdateSourceKey && this.lastUpdateSourceKey !== updateSourceKey) {
            Logger.info('🔄 [Updater] 업데이트 소스 또는 채널 변경 감지: 이전 조회 캐시를 초기화합니다.');
            this.lastCheck = 0;
            this.updateInfo = null;
            this.lastCheckWasForced = false;
        }
        this.lastUpdateSourceKey = updateSourceKey;

        if (!force && this.updateInfo && !this.lastCheckWasForced && (now - this.lastCheck < 60000)) {
            return this.updateInfo;
        }

        if (force) {
            Logger.info('🔄 [Updater] 강제 업데이트 체크 모드 활성화');
        }

        let latest = null;
        if (force) {
            const releases = await this.fetchReleases();
            const currentTag = `v${this.currentVersion}`;
            const exactCurrentRaw = releases.find((release) => String(release?.tag_name || '').trim() === currentTag) || null;
            const exactCurrent = await this.enrichReleaseWithManifest(exactCurrentRaw);
            const exactCurrentAsset = exactCurrent ? this.getPlatformAsset(exactCurrent.assets) : null;
            if (exactCurrentAsset) {
                latest = exactCurrent;
            } else {
                const selected = this.selectReleaseForChannel(releases, CONFIG.USER_ROLE);
                latest = await this.enrichReleaseWithManifest(selected);
            }
        } else {
            latest = await this.getLatestRelease(CONFIG.USER_ROLE);
        }

        if (!latest) return null;

        const latestVersion = latest.tag_name.replace(/^v/, '');
        const isNewer = this.compareVersions(latestVersion, this.currentVersion) > 0;

        if (!force && !isNewer) {
            Logger.info(`✅ [Updater] 현재 최신 버전(v${this.currentVersion})을 사용 중입니다.`);
            this.lastCheck = now;
            this.lastCheckWasForced = false;
            this.updateInfo = { hasUpdate: false, latestVersion };
            return this.updateInfo;
        }

        // 중요: 에셋(빌드물)이 아직 업로드 중일 수 있으므로, 현재 플랫폼에 맞는 파일이 있는지 확인
        const matchingAsset = this.getPlatformAsset(latest.assets);
        const hasUpdate = !!matchingAsset;

        this.lastCheck = now;
        this.lastCheckWasForced = force;
        this.updateInfo = {
            hasUpdate,
            isNewer, // 버전 자체는 높지만 에셋이 없을 수 있음
            currentVersion: this.currentVersion,
            latestVersion,
            tagName: latest.tag_name,
            body: latest.body,
            details: this.normalizeUpdateDetails(latest),
            assets: latest.assets,
            publishDate: latest.published_at,
            isPrerelease: latest.prerelease,
            htmlUrl: latest.html_url
        };

        if (isNewer && !matchingAsset) {
            Logger.info(`ℹ️ [Updater] 새 버전(${latest.tag_name})을 찾았으나, 현재 플랫폼용 에셋이 아직 업로드되지 않았습니다.`);
        }

        return this.updateInfo;
    }

    /**
     * Compare semver strings (Handles prerelease tags like -beta, -alpha, -dev10)
     */
    compareVersions(v1, v2) {
        const parse = (v) => {
            const [ver, pre] = String(v).replace(/^v/, '').split('-');
            const parts = ver.split('.').map(Number);

            // Prerelease 파싱 (예: "dev10" -> { type: "dev", num: 10 })
            let preObj = null;
            if (pre) {
                const match = pre.match(/^([a-z]+)(\d*)$/i);
                if (match) {
                    preObj = {
                        type: match[1].toLowerCase(),
                        num: match[2] ? parseInt(match[2], 10) : 0
                    };
                } else {
                    preObj = { type: pre.toLowerCase(), num: 0 };
                }
            }

            return { parts, pre: preObj };
        };

        const sv1 = parse(v1);
        const sv2 = parse(v2);

        // 1. Major.Minor.Patch 비교
        for (let i = 0; i < Math.max(sv1.parts.length, sv2.parts.length); i++) {
            const n1 = sv1.parts[i] || 0;
            const n2 = sv2.parts[i] || 0;
            if (n1 > n2) return 1;
            if (n1 < n2) return -1;
        }

        // 2. 버전 숫자가 같다면 Prerelease 존재 여부 비교 (정식 버전이 prerelease보다 높음)
        if (sv1.pre === null && sv2.pre !== null) return 1;
        if (sv1.pre !== null && sv2.pre === null) return -1;

        // 3. 둘 다 prerelease라면 비교
        if (sv1.pre !== null && sv2.pre !== null) {
            // 타입 비교 (예: beta > alpha)
            if (sv1.pre.type > sv2.pre.type) return 1;
            if (sv1.pre.type < sv2.pre.type) return -1;

            // 타입이 같다면 숫자 비교 (예: dev10 > dev9)
            if (sv1.pre.num > sv2.pre.num) return 1;
            if (sv1.pre.num < sv2.pre.num) return -1;
        }

        return 0;
    }

    /**
     * Determine the correct asset for the current platform
     */
    getPlatformAsset(assets) {
        if (!Array.isArray(assets)) return null;

        const platform = this.platform;
        const arch = this.arch;
        Logger.info(`🔍 [Updater] 플랫폼 확인: ${platform}-${arch} (총 에셋 수: ${assets.length})`);

        let patterns = [];
        if (platform === 'darwin' && arch === 'arm64') {
            patterns = ['mac-arm64'];
        } else if (platform === 'win32' && arch === 'x64') {
            patterns = ['win-x64', 'windows-x64'];
        }

        const asset = assets.find(a => {
            const name = a.name.toLowerCase();
            return patterns.some(p => name.includes(p)) && name.endsWith('.zip');
        });

        if (asset) {
            Logger.info(`✅ [Updater] 매칭된 에셋 발견: ${asset.name}`);
        } else {
            Logger.warn(`❌ [Updater] 현재 플랫폼에 맞는 에셋을 찾지 못함 (Patterns: ${patterns.join(', ')})`);
        }

        return asset || null;
    }

    /**
     * Apply full folder update (Full Sync)
     */
    /**
     * Cancel an in-progress download (only effective during the downloading stage)
     */
    cancel() {
        if (this._cancelController) {
            this._cancelController.abort();
            this._cancelController = null;
        }
        if (this.progress.stage === 'downloading') {
            this.progress = { active: false, stage: 'idle', message: '취소됨', percent: 0, totalSize: 0, downloadedSize: 0 };
            this.isUpdating = false;
            Logger.info('⚠️ [Updater] 다운로드 취소됨');
        }
    }

    async applyUpdate(onProgress = null) {
        if (this.isUpdating) throw new Error('업데이트가 이미 진행 중입니다.');
        if (!this.updateInfo || !this.updateInfo.hasUpdate) throw new Error('업데이트 정보가 없거나 최신 버전입니다.');

        const asset = this.getPlatformAsset(this.updateInfo.assets);
        if (!asset) throw new Error(`현재 플랫폼(${process.platform}-${process.arch})에 맞는 배포 파일을 찾을 수 없습니다.`);

        this.isUpdating = true;
        const updateOperation = {
            operationId: crypto.randomUUID(),
            targetVersion: String(this.updateInfo.latestVersion || '').trim()
        };
        this.progress = { active: true, stage: 'downloading', message: '다운로드 준비 중...', percent: 0, totalSize: 0, downloadedSize: 0 };
        try {
            if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
            const zipPath = path.join(this.tempDir, 'update.zip');
            const extractDir = path.join(this.tempDir, 'extracted');

            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            fs.mkdirSync(extractDir, { recursive: true });

            let downloadUrl = asset.browser_download_url;
            // 커스텀 서버일 경우 상대 경로(파일명만 있는 경우 등) 지원
            const customManifestUrl = this.getCustomManifestUrl();
            if (!/^https?:\/\//i.test(downloadUrl) && this.getUpdateServerType() === 'custom' && customManifestUrl) {
                try {
                    const baseUrl = new URL('.', customManifestUrl).href;
                    downloadUrl = new URL(downloadUrl, baseUrl).href;
                    Logger.info(`🔗 [Updater] 상대 경로 다운로드 URL 변환: ${downloadUrl}`);
                } catch (e) {
                    Logger.warn(`⚠️ [Updater] URL 변환 실패: ${e.message}`);
                }
            }

            Logger.info(`📂 [Updater] 다운로드 시작: ${downloadUrl}`);
            this.progress.message = '다운로드 중...';
            this._cancelController = new AbortController();
            let response;
            try {
                response = await axios({
                    url: downloadUrl,
                    method: 'GET',
                    responseType: 'stream',
                    signal: this._cancelController.signal
                });
            } catch (axiosErr) {
                if (axiosErr.name === 'CanceledError' || axiosErr.code === 'ERR_CANCELED') {
                    throw new Error('취소됨');
                }
                throw axiosErr;
            }
            this._cancelController = null;

            const totalSize = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedSize = 0;
            this.progress.totalSize = totalSize;
            const writer = fs.createWriteStream(zipPath);

            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
                this.progress.downloadedSize = downloadedSize;
                this.progress.percent = percent;
                this.progress.message = `다운로드 중... ${percent}%`;
                if (onProgress) onProgress({ percent, totalSize, downloadedSize });
            });

            await new Promise((resolve, reject) => {
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // 🔐 SHA-256 무결성 검증 (update.json에 sha256 필드가 있는 경우)
            const expectedHash = String(asset.sha256 || '').trim().toLowerCase();
            if (expectedHash) {
                Logger.info('🔐 [Updater] SHA-256 무결성 검증 시작...');
                this.progress = { active: true, stage: 'verifying', message: '무결성 검증 중...', percent: 100, totalSize, downloadedSize };
                const actualHash = await this.computeFileHash(zipPath, 'sha256');
                if (actualHash !== expectedHash) {
                    throw new Error(`SHA-256 체크섬 불일치!\n기대: ${expectedHash}\n실제: ${actualHash}\n파일이 손상되었을 수 있습니다.`);
                }
                Logger.info(`✅ [Updater] SHA-256 검증 통과: ${actualHash}`);
            } else {
                Logger.warn('⚠️ [Updater] 체크섬 정보 없음 — 무결성 검증을 건너뜁니다.');
            }

            Logger.info('📂 [Updater] 압축 해제 중...');
            this.progress = { active: true, stage: 'extracting', message: '압축 해제 중...', percent: 100, totalSize, downloadedSize };
            await this.unzip(zipPath, extractDir);

            // 중요: 압축을 해제한 내용물이 버전·플랫폼 이름의 루트 폴더로 중첩될 수 있음
            let sourceDir = extractDir;
            const entries = fs.readdirSync(extractDir);
            if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
                sourceDir = path.join(extractDir, entries[0]);
                Logger.info(`📂 [Updater] 중첩 폴더 발견: ${entries[0]}`);
            }

            if (this.platform === 'win32') {
                Logger.info('🪟 [Updater] Windows 지연 적용 준비 중...');
                this.progress.stage = 'syncing';
                this.progress.message = '재시작 후 업데이트 적용 준비 중...';
                this.prepareWindowsDeferredApply(sourceDir, updateOperation);
            } else {
                Logger.info('📂 [Updater] 전체 폴더 동기화 업데이트 시작...');
                this.progress.stage = 'syncing';
                this.progress.message = '파일 동기화 중...';
                this.syncFolders(sourceDir, this.appRootDir);

                // 업데이트 성공 시 tmp_update 임시 폴더 정리
                try {
                    if (fs.existsSync(this.tempDir)) {
                        fs.rmSync(this.tempDir, { recursive: true, force: true });
                        Logger.info('🧹 [Updater] tmp_update 임시 폴더 정리 완료');
                    }
                } catch (cleanupErr) {
                    Logger.warn(`⚠️ [Updater] tmp_update 정리 실패 (무시됨): ${cleanupErr.message}`);
                }
                this.writeUpdateCompletionReceipt(updateOperation);
            }

            Logger.info(this.platform === 'win32'
                ? '✅ [Updater] 업데이트 적용 준비 완료! 재시작 후 Windows helper가 파일을 교체합니다.'
                : '✅ [Updater] 업데이트 완료! 앱을 재시작해 주세요.');
            this.progress = { active: true, stage: 'done', message: '업데이트 완료! 재시작 중...', percent: 100, totalSize, downloadedSize };
            return true;
        } catch (e) {
            Logger.error(`❌ [Updater] 업데이트 실패: ${e.message}`);
            this.progress = { active: false, stage: 'error', message: `업데이트 실패: ${e.message}`, percent: 0, totalSize: 0, downloadedSize: 0 };
            throw e;
        } finally {
            this.isUpdating = false;
        }
    }

    prepareWindowsDeferredApply(sourceDir, updateOperation = {}) {
        if (this.platform !== 'win32') return;

        const helperScriptPath = path.join(this.tempDir, 'apply-update.ps1');
        const helperBootstrapScriptPath = path.join(this.tempDir, 'apply-update-bootstrap.ps1');
        const helperSpecPath = path.join(this.tempDir, 'apply-update.json');
        const helperLogPath = path.join(this.tempDir, 'apply-update.log');
        const helperBootstrapLogPath = path.join(this.tempDir, 'apply-update-bootstrap.log');
        const helperReadyPath = path.join(this.tempDir, 'apply-update.ready');
        const helperCompletedPath = path.join(this.tempDir, 'apply-update.completed');
        const helperFailedPath = path.join(this.tempDir, 'apply-update.failed');
        const scriptBody = `
$ErrorActionPreference = 'Stop'
$preserve = @('config', 'logs', 'data', 'workspace', 'tmp_update', '.git', '.DS_Store')
$config = $null
$logPath = $null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $script:logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Remove-BackupArtifacts {
    param([string]$RootPath)
    Get-ChildItem -LiteralPath $RootPath -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*.old' } |
        ForEach-Object {
            try {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
            } catch {
                Write-Log "backup cleanup failed: $($_.FullName) - $($_.Exception.Message)"
            }
        }
}

try {
    $configPath = Join-Path $PSScriptRoot 'apply-update.json'
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $sourceDir = [string]$config.sourceDir
    $appDir = [string]$config.appDir
    $exePath = [string]$config.exePath
    $waitPid = [int]$config.waitPid
    $script:logPath = [string]$config.logPath
    $readyPath = [string]$config.readyPath
    $completedPath = [string]$config.completedPath
    $failedPath = [string]$config.failedPath
    $receiptPath = [string]$config.receiptPath
    $operationId = [string]$config.operationId
    $targetVersion = [string]$config.targetVersion

    if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
        throw "Update source directory does not exist: $sourceDir"
    }
    if (-not (Test-Path -LiteralPath $appDir -PathType Container)) {
        throw "Application directory does not exist: $appDir"
    }
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        throw "Application executable does not exist: $exePath"
    }
    if ($waitPid -le 0) {
        throw "Invalid application process id: $waitPid"
    }

    Write-Log "helper started (pid=$PID, waitingFor=$waitPid, target=$targetVersion)"
    Set-Content -LiteralPath $readyPath -Value $PID -Encoding ASCII -Force
    for ($i = 0; $i -lt 600; $i++) {
        $target = Get-Process -Id $waitPid -ErrorAction SilentlyContinue
        if (-not $target) { break }
        Start-Sleep -Milliseconds 500
    }
    $target = Get-Process -Id $waitPid -ErrorAction SilentlyContinue
    if ($target) {
        throw "Timed out waiting for the running app to exit (pid=$waitPid)."
    }
    Start-Sleep -Milliseconds 500

    Get-ChildItem -LiteralPath $sourceDir -Force | ForEach-Object {
        $name = $_.Name
        if ($preserve -contains $name) {
            Write-Log "preserve skip: $name"
        } else {
            $srcPath = $_.FullName
            $destPath = Join-Path $appDir $name
            $backupPath = "$destPath.old"

            if (Test-Path -LiteralPath $backupPath) {
                Remove-Item -LiteralPath $backupPath -Recurse -Force -ErrorAction SilentlyContinue
            }

            if (Test-Path -LiteralPath $destPath) {
                try {
                    Rename-Item -LiteralPath $destPath -NewName ([System.IO.Path]::GetFileName($backupPath)) -ErrorAction Stop
                    Write-Log "backup created: $name"
                } catch {
                    Write-Log "backup rename failed, deleting directly: $name - $($_.Exception.Message)"
                    Remove-Item -LiteralPath $destPath -Recurse -Force -ErrorAction Stop
                }
            }

            if ($_.PSIsContainer) {
                Copy-Item -LiteralPath $srcPath -Destination $destPath -Recurse -Force -ErrorAction Stop
            } else {
                Copy-Item -LiteralPath $srcPath -Destination $destPath -Force -ErrorAction Stop
            }

            Write-Log "replaced: $name"
        }
    }

    Remove-BackupArtifacts -RootPath $appDir
    $receiptDir = Split-Path -Parent $receiptPath
    New-Item -ItemType Directory -Path $receiptDir -Force | Out-Null
    $receipt = [ordered]@{
        operationId = $operationId
        targetVersion = $targetVersion
        completedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $tempReceiptPath = "$receiptPath.tmp-$PID"
    $receipt | ConvertTo-Json -Compress | Set-Content -LiteralPath $tempReceiptPath -Encoding UTF8 -Force
    if (Test-Path -LiteralPath $receiptPath) {
        Remove-Item -LiteralPath $receiptPath -Force -ErrorAction Stop
    }
    Move-Item -LiteralPath $tempReceiptPath -Destination $receiptPath -Force -ErrorAction Stop
    Set-Content -LiteralPath $completedPath -Value $targetVersion -Encoding UTF8 -Force
    Write-Log "apply completed (target=$targetVersion)"
    Write-Log "relaunch: $exePath"
    Start-Process -FilePath $exePath | Out-Null
    exit 0
} catch {
    $fatalMessage = $_.Exception.Message
    try {
        if ($script:logPath) {
            Write-Log "fatal: $fatalMessage"
        }
        if ($config -and $config.failedPath) {
            Set-Content -LiteralPath ([string]$config.failedPath) -Value $fatalMessage -Encoding UTF8 -Force
        }
    } catch { }
    Write-Error $fatalMessage
    try {
        $shouldRelaunch = $false
        if ($config -and $config.readyPath -and (Test-Path -LiteralPath ([string]$config.readyPath))) {
            $runningApp = Get-Process -Id ([int]$config.waitPid) -ErrorAction SilentlyContinue
            $shouldRelaunch = -not $runningApp
        }
        if ($shouldRelaunch -and $config.exePath -and (Test-Path -LiteralPath ([string]$config.exePath) -PathType Leaf)) {
            Start-Process -FilePath ([string]$config.exePath) | Out-Null
        }
    } catch { }
    exit 1
}
`.trimStart();

        this.fs.writeFileSync(helperScriptPath, scriptBody, 'utf8');
        const helperSpec = {
            sourceDir,
            appDir: this.appRootDir,
            exePath: this.executablePath,
            waitPid: process.pid,
            logPath: helperLogPath,
            readyPath: helperReadyPath,
            completedPath: helperCompletedPath,
            failedPath: helperFailedPath,
            receiptPath: this.updateCompletionReceiptPath,
            operationId: String(updateOperation.operationId || crypto.randomUUID()),
            targetVersion: String(updateOperation.targetVersion || this.updateInfo?.latestVersion || '').trim()
        };
        this.fs.mkdirSync(path.dirname(this.updateCompletionReceiptPath), { recursive: true });
        this.fs.writeFileSync(helperSpecPath, JSON.stringify(helperSpec, null, 2), 'utf8');
        for (const stalePath of [
            helperLogPath,
            helperBootstrapLogPath,
            helperReadyPath,
            helperCompletedPath,
            helperFailedPath
        ]) {
            try {
                if (this.fs.existsSync(stalePath)) this.fs.rmSync(stalePath, { force: true });
            } catch (_) { }
        }

        const encodedHelperCommand = Buffer.from(
            `& '${helperScriptPath.replace(/'/g, "''")}'`,
            'utf16le'
        ).toString('base64');
        const bootstrapBody = `
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'apply-update.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$readyPath = [string]$config.readyPath
$enginePath = (Get-Process -Id $PID -ErrorAction Stop).Path
$arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${encodedHelperCommand}')
$helper = Start-Process -FilePath $enginePath -ArgumentList $arguments -WindowStyle Hidden -PassThru
for ($i = 0; $i -lt 100; $i++) {
    if (Test-Path -LiteralPath $readyPath) {
        Write-Output "apply helper ready pid=$($helper.Id)"
        exit 0
    }
    if ($helper.HasExited) {
        throw "Apply helper exited before readiness (code=$($helper.ExitCode))."
    }
    Start-Sleep -Milliseconds 50
}
throw 'Timed out waiting for the apply helper readiness marker.'
`.trimStart();
        this.fs.writeFileSync(helperBootstrapScriptPath, bootstrapBody, 'utf8');

        const args = [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            helperBootstrapScriptPath
        ];

        this._pendingExternalRestart = {
            mode: 'windows-update-helper',
            helperScriptPath,
            helperBootstrapScriptPath,
            helperSpecPath,
            helperLogPath,
            helperBootstrapLogPath,
            helperReadyPath,
            helperCompletedPath,
            helperFailedPath,
            args
        };
        Logger.info(`🪟 [Updater] Windows helper 스크립트 준비 완료: ${helperScriptPath}`);
    }

    getWindowsPowerShellCandidates() {
        if (Array.isArray(this.windowsPowerShellCandidates)) {
            return this.windowsPowerShellCandidates.map(value => String(value || '').trim()).filter(Boolean);
        }

        const candidates = [];
        const systemRoot = String(this.env.SystemRoot || this.env.WINDIR || '').trim();
        if (systemRoot) {
            const bundledWindowsPowerShell = path.join(
                systemRoot,
                'System32',
                'WindowsPowerShell',
                'v1.0',
                'powershell.exe'
            );
            if (this.fs.existsSync(bundledWindowsPowerShell)) candidates.push(bundledWindowsPowerShell);
        }
        candidates.push('powershell.exe', 'pwsh.exe');
        return [...new Set(candidates)];
    }

    appendWindowsHelperBootstrapLog(message) {
        const logPath = this._pendingExternalRestart?.helperBootstrapLogPath;
        if (!logPath) return;
        try {
            const timestamp = new Date().toISOString();
            this.fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, 'utf8');
        } catch (_) { }
    }

    waitForWindowsBootstrapReady(child, readyPath) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let timeoutTimer = null;

            const finish = (error = null) => {
                if (settled) return;
                settled = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                child.removeListener('error', onError);
                child.removeListener('exit', onExit);
                if (error) reject(error);
                else resolve();
            };
            const isReady = () => {
                try {
                    return this.fs.existsSync(readyPath);
                } catch (_) {
                    return false;
                }
            };
            const onError = (error) => finish(error);
            const onExit = (code, signal) => {
                if (code === 0 && isReady()) finish();
                else finish(new Error(`Windows helper가 준비되기 전에 bootstrap이 종료되었습니다. (code=${code ?? 'null'}, signal=${signal || 'none'})`));
            };

            child.once('error', onError);
            child.once('exit', onExit);
            timeoutTimer = setTimeout(() => {
                finish(new Error('Windows helper 및 bootstrap 준비 확인 시간이 초과되었습니다.'));
            }, this.windowsHelperReadyTimeoutMs);
        });
    }

    async launchWindowsDeferredApply() {
        const pending = this._pendingExternalRestart;
        if (this.platform !== 'win32' || pending?.mode !== 'windows-update-helper') return false;

        let lastError = null;
        for (const command of this.getWindowsPowerShellCandidates()) {
            let outputFd = null;
            let child = null;
            try {
                this.appendWindowsHelperBootstrapLog(`launch requested: ${command}`);
                outputFd = this.fs.openSync(pending.helperBootstrapLogPath, 'a');
                child = this.spawnProcess(command, pending.args, {
                    detached: false,
                    stdio: ['ignore', outputFd, outputFd],
                    windowsHide: true
                });
                await this.waitForWindowsBootstrapReady(child, pending.helperReadyPath);
                this.appendWindowsHelperBootstrapLog(`helper ready: ${command} (pid=${child.pid || 'unknown'})`);
                return true;
            } catch (error) {
                lastError = error;
                this.appendWindowsHelperBootstrapLog(`launch failed: ${command} - ${error.message}`);
                try {
                    if (child && !child.killed) child.kill();
                } catch (_) { }
            } finally {
                try {
                    if (outputFd !== null) this.fs.closeSync(outputFd);
                } catch (_) { }
            }
        }

        throw new Error(`Windows 업데이트 helper를 시작하지 못했습니다: ${lastError?.message || 'PowerShell을 찾을 수 없습니다.'}`);
    }

    isWindowsDeferredApplyPending() {
        return this.platform === 'win32'
            && this._pendingExternalRestart?.mode === 'windows-update-helper';
    }

    writeUpdateCompletionReceipt(updateOperation = {}) {
        const operationId = String(updateOperation.operationId || '').trim();
        const targetVersion = String(updateOperation.targetVersion || '').trim();
        if (!operationId || !targetVersion) {
            throw new Error('업데이트 완료 기록 정보가 올바르지 않습니다.');
        }

        const receipt = {
            operationId,
            targetVersion,
            completedAt: new Date().toISOString()
        };
        const receiptDir = path.dirname(this.updateCompletionReceiptPath);
        const tempPath = `${this.updateCompletionReceiptPath}.tmp-${process.pid}`;
        this.fs.mkdirSync(receiptDir, { recursive: true });
        this.fs.writeFileSync(tempPath, JSON.stringify(receipt, null, 2), 'utf8');
        if (this.fs.existsSync(this.updateCompletionReceiptPath)) {
            this.fs.rmSync(this.updateCompletionReceiptPath, { force: true });
        }
        this.fs.renameSync(tempPath, this.updateCompletionReceiptPath);
        Logger.info(`🎉 [Updater] 업데이트 완료 기록 저장: v${targetVersion}`);
        return receipt;
    }

    readUpdateCompletionReceipt() {
        try {
            if (!this.fs.existsSync(this.updateCompletionReceiptPath)) return null;
            const raw = this.fs.readFileSync(this.updateCompletionReceiptPath, 'utf8').replace(/^\uFEFF/, '');
            const parsed = JSON.parse(raw);
            const receipt = {
                operationId: String(parsed?.operationId || '').trim(),
                targetVersion: String(parsed?.targetVersion || '').trim(),
                completedAt: String(parsed?.completedAt || '').trim()
            };
            if (!receipt.operationId || !receipt.targetVersion) return null;
            return receipt;
        } catch (error) {
            Logger.warn(`⚠️ [Updater] 업데이트 완료 기록을 읽지 못했습니다: ${error.message}`);
            return null;
        }
    }

    getPendingUpdateCompletion() {
        const receipt = this.readUpdateCompletionReceipt();
        if (!receipt || receipt.targetVersion !== this.currentVersion) {
            return { pending: false };
        }
        return { pending: true, ...receipt };
    }

    acknowledgeUpdateCompletion(operationId) {
        const expectedOperationId = String(operationId || '').trim();
        const receipt = this.readUpdateCompletionReceipt();
        if (!receipt
            || !expectedOperationId
            || receipt.operationId !== expectedOperationId
            || receipt.targetVersion !== this.currentVersion) {
            return { acknowledged: false };
        }
        this.fs.rmSync(this.updateCompletionReceiptPath, { force: true });
        Logger.info(`✨ [Updater] 업데이트 완료 안내 확인: v${receipt.targetVersion}`);
        return { acknowledged: true };
    }

    /**
     * Recursively sync source folder to target folder, preserving specific items.
     * Directories are replaced atomically (rename → cpSync) to preserve symlinks and bundle integrity.
     */
    syncFolders(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

        const items = fs.readdirSync(src);
        for (const item of items) {
            if (this.preserveList.includes(item)) {
                Logger.info(`⏭️ [Updater] 보존 대상 제외: ${item}`);
                continue;
            }

            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            // lstatSync: 심볼릭 링크 자체의 타입을 확인 (따라가지 않음)
            const srcStat = fs.lstatSync(srcPath);

            try {
                if (srcStat.isDirectory()) {
                    // 디렉토리: 원자적 교체 (기존 폴더를 .old로 이름 변경 후 새 폴더를 통째로 복사)
                    // 이 방식은 macOS .app 번들 내부의 심볼릭 링크를 완벽히 보존합니다.
                    if (fs.existsSync(destPath)) {
                        const backupPath = destPath + '.old';
                        try {
                            if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
                            fs.renameSync(destPath, backupPath);
                            Logger.info(`🔄 [Updater] 디렉토리 백업: ${item} → ${item}.old`);
                        } catch (renameErr) {
                            // rename 실패 시 (예: 크로스-디바이스 이동) 기존 폴더 삭제 후 복사
                            Logger.warn(`⚠️ [Updater] 디렉토리 백업 실패, 직접 교체: ${item} - ${renameErr.message}`);
                            fs.rmSync(destPath, { recursive: true, force: true });
                        }
                    }
                    fs.cpSync(srcPath, destPath, { recursive: true, verbatimSymlinks: true });
                    Logger.info(`✅ [Updater] 디렉토리 교체 완료: ${item}`);
                } else if (srcStat.isSymbolicLink()) {
                    // 심볼릭 링크: 링크 자체를 복제
                    const linkTarget = fs.readlinkSync(srcPath);
                    if (fs.existsSync(destPath)) {
                        const backupPath = destPath + '.old';
                        try {
                            if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
                            fs.renameSync(destPath, backupPath);
                        } catch (_) {
                            fs.rmSync(destPath, { recursive: true, force: true });
                        }
                    }
                    fs.symlinkSync(linkTarget, destPath);
                } else {
                    // 일반 파일: 기존 로직 (rename → copy)
                    if (fs.existsSync(destPath)) {
                        const backupPath = destPath + '.old';
                        try {
                            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
                            fs.renameSync(destPath, backupPath);
                        } catch (_) {
                            try { fs.unlinkSync(destPath); } catch (__) { }
                        }
                    }
                    fs.copyFileSync(srcPath, destPath);
                    if (process.platform !== 'win32') {
                        fs.chmodSync(destPath, '755');
                    }
                }
            } catch (err) {
                Logger.warn(`⚠️ [Updater] 항목 교체 중 오류 (무시됨): ${item} - ${err.message}`);
            }
        }

        // 동기화 완료 후 .old 백업 파일/폴더 정리
        try {
            const destItems = fs.readdirSync(dest);
            for (const item of destItems) {
                if (item.endsWith('.old')) {
                    const oldPath = path.join(dest, item);
                    try {
                        fs.rmSync(oldPath, { recursive: true, force: true });
                    } catch (_) { }
                }
            }
        } catch (_) { }
    }

    /**
     * Compute the hash of a file using streaming (memory-efficient for large files).
     * @param {string} filePath - Path to the file
     * @param {string} algorithm - Hash algorithm (e.g., 'sha256')
     * @returns {Promise<string>} Hex digest of the file hash
     */
    computeFileHash(filePath, algorithm = 'sha256') {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash(algorithm);
            const stream = fs.createReadStream(filePath);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(new Error(`해시 계산 실패: ${err.message}`)));
        });
    }

    async unzip(zipPath, targetDir) {
        return new Promise((resolve, reject) => {
            let cmd = '';
            if (this.platform === 'win32') {
                cmd = `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force"`;
            } else {
                // -q: quiet mode (대량의 파일 압축 해제 시 stdout 버퍼 행 방지)
                // -o: overwrite
                cmd = `unzip -qo "${zipPath}" -d "${targetDir}"`;
            }

            Logger.info(`📂 [Updater] 압축 해제 명령 실행: ${cmd}`);

            const child = spawn(cmd, { shell: true, stdio: 'ignore' });

            child.on('error', (err) => {
                reject(new Error(`압축 해제 프로세스 오류: ${err.message}`));
            });

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`압축 해제 실패 (Exit code: ${code})`));
            });
        });
    }

    async restart(options = {}) {
        if (this.isWindowsDeferredApplyPending()) {
            Logger.info('🪟 [Updater] Windows helper 실행 및 준비 상태를 확인합니다.');
            try {
                await this.launchWindowsDeferredApply();
            } catch (error) {
                Logger.error(`❌ [Updater] Windows helper 시작 실패: ${error.message}`);
                this.progress = {
                    ...this.progress,
                    active: false,
                    stage: 'error',
                    message: `업데이트 재시작 실패: ${error.message}`
                };
                throw error;
            }
            Logger.info('🪟 [Updater] Windows helper 준비 확인 완료. 현재 프로세스를 종료합니다.');
            const exitDelayMs = Math.max(0, Number(options.exitDelayMs) || 0);
            if (exitDelayMs > 0) setTimeout(() => this.exitProcess(0), exitDelayMs);
            else this.exitProcess(0);
            return true;
        }

        const bin = process.execPath;
        const args = process.argv.slice(1).filter(arg => arg !== 'ui'); // UI 모드면 UI로 다시 뜨게 하거나, CMD면 CMD로

        Logger.info('🔄 [Updater] 프로세스 재시작 중...');

        const child = this.spawnProcess(bin, args, {
            detached: true,
            stdio: 'inherit'
        });
        child.unref();
        this.exitProcess(0);
        return true;
    }
}

module.exports = new Updater();
module.exports.Updater = Updater;
