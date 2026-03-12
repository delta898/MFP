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
    constructor() {
        this.currentVersion = APP_VERSION;
        this.repo = CONFIG.UPDATE_MIRROR_REPO || CONFIG.DEFAULT_UPDATE_MIRROR_REPO;
        this.updateServerType = CONFIG.UPDATE_SERVER_TYPE || 'github';
        this.customUpdateCheckUrl = CONFIG.CUSTOM_UPDATE_CHECK_URL;
        this.appRootDir = CONFIG.APP_ROOT_DIR;
        this.tempDir = path.join(this.appRootDir, CONFIG.UPDATE_TEMP_DIR || 'tmp_update');
        this.isUpdating = false;
        this.lastCheck = 0;
        this.updateInfo = null;

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

    /**
     * Get the latest release information from the server (GitHub or Custom)
     */
    async getLatestRelease(userRole = 'User') {
        try {
            let releases = [];

            if (this.updateServerType === 'custom' && this.customUpdateCheckUrl) {
                Logger.debug(`📂 [Updater] 커스텀 서버에서 업데이트 체크: ${this.customUpdateCheckUrl}`);
                const response = await axios.get(this.customUpdateCheckUrl, {
                    timeout: 5000
                });
                // 단일 객체 혹은 배열 모두 지원
                releases = Array.isArray(response.data) ? response.data : [response.data];
            } else {
                // GitHub API
                const url = `https://api.github.com/repos/${this.repo}/releases`;
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'BlogGenius-Updater' },
                    timeout: 5000
                });
                releases = Array.isArray(response.data) ? response.data : [];
            }

            if (releases.length === 0 || !releases[0]) return null;

            // 추가: GitHub API 결과가 가끔 사전식(dev9 > dev10)으로 오기 때문에, 세부 버전 규칙으로 전체 정렬
            releases.sort((a, b) => this.compareVersions(b.tag_name, a.tag_name));

            // 채널 결정 (Explicit 'update_channel' 우선, 없으면 'USER_ROLE' 기반 매핑)
            let channel = String(CONFIG.UPDATE_CHANNEL || '').trim().toLowerCase();
            if (!channel) {
                const role = String(userRole || 'User').trim().toLowerCase();
                if (role === 'developer') channel = 'dev';
                else if (role === 'tester') channel = 'beta';
                else channel = 'stable';
            }

            if (channel === 'dev') {
                // Dev: 무조건 가장 최신(첫 번째) 릴리즈 반환 (Alpha, Dev 등 포함)
                return releases[0];
            } else if (channel === 'beta') {
                // Beta: 정식 버전 또는 Beta/RC 버전 중 최신 반환 (Alpha, Dev 제외)
                return releases.find(r =>
                    !r.prerelease ||
                    (r.tag_name.toLowerCase().includes('beta') || r.tag_name.toLowerCase().includes('rc')) &&
                    !r.tag_name.toLowerCase().includes('alpha') && !r.tag_name.toLowerCase().includes('dev')
                ) || null;
            } else {
                // Stable (Default): 오직 정식 버전(prerelease: false)만 반환
                return releases.find(r => !r.prerelease) || null;
            }
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
        if (!force && this.updateInfo && (now - this.lastCheck < 60000)) return this.updateInfo;

        if (force) {
            Logger.info('🔄 [Updater] 강제 업데이트 체크 모드 활성화');
        }

        // config.json의 USER_ROLE 설정(User/Tester/Developer)에 따라 판단
        const latest = await this.getLatestRelease(CONFIG.USER_ROLE);

        if (!latest) return null;

        const latestVersion = latest.tag_name.replace(/^v/, '');
        const isNewer = this.compareVersions(latestVersion, this.currentVersion) > 0;

        if (!force && !isNewer) {
            Logger.info(`✅ [Updater] 현재 최신 버전(v${this.currentVersion})을 사용 중입니다.`);
            this.lastCheck = now;
            this.updateInfo = { hasUpdate: false, latestVersion };
            return this.updateInfo;
        }

        // 중요: 에셋(빌드물)이 아직 업로드 중일 수 있으므로, 현재 플랫폼에 맞는 파일이 있는지 확인
        const matchingAsset = this.getPlatformAsset(latest.assets);
        const hasUpdate = !!matchingAsset;

        this.lastCheck = now;
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

        const platform = process.platform;
        const arch = process.arch;
        Logger.info(`🔍 [Updater] 플랫폼 확인: ${platform}-${arch} (총 에셋 수: ${assets.length})`);

        let patterns = [];
        if (platform === 'darwin') {
            // macOS: arm64(M1/M2/M3) 또는 x64(Intel)
            if (arch === 'arm64') {
                patterns = ['mac-arm64'];
            } else {
                patterns = ['mac-intel', 'macos-x64'];
            }
        } else if (platform === 'win32') {
            patterns = ['win-x64', 'windows-x64'];
        } else if (platform === 'linux') {
            patterns = ['linux-x64'];
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

        return asset;
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
        this.progress = { active: true, stage: 'downloading', message: '다운로드 준비 중...', percent: 0, totalSize: 0, downloadedSize: 0 };
        try {
            if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
            const zipPath = path.join(this.tempDir, 'update.zip');
            const extractDir = path.join(this.tempDir, 'extracted');

            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            fs.mkdirSync(extractDir, { recursive: true });

            let downloadUrl = asset.browser_download_url;
            // 커스텀 서버일 경우 상대 경로(파일명만 있는 경우 등) 지원
            if (!/^https?:\/\//i.test(downloadUrl) && this.updateServerType === 'custom' && this.customUpdateCheckUrl) {
                try {
                    const baseUrl = new URL('.', this.customUpdateCheckUrl).href;
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

            // 중요: 압축을 해제한 내용물이 'BlogGenius-v0.8.42-linux-x64' 같이 중첩된 폴더일 수 있음
            let sourceDir = extractDir;
            const entries = fs.readdirSync(extractDir);
            if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
                sourceDir = path.join(extractDir, entries[0]);
                Logger.info(`📂 [Updater] 중첩 폴더 발견: ${entries[0]}`);
            }

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

            Logger.info('✅ [Updater] 업데이트 완료! 앱을 재시작해 주세요.');
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
            if (process.platform === 'win32') {
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

    restart() {
        const bin = process.execPath;
        const args = process.argv.slice(1).filter(arg => arg !== 'ui'); // UI 모드면 UI로 다시 뜨게 하거나, CMD면 CMD로

        Logger.info('🔄 [Updater] 프로세스 재시작 중...');

        const child = spawn(bin, args, {
            detached: true,
            stdio: 'inherit'
        });
        child.unref();
        process.exit(0);
    }
}

module.exports = new Updater();
