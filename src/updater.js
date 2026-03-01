const fs = require('fs');
const path = require('path');
const axios = require('axios');
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
        this.appRootDir = CONFIG.APP_ROOT_DIR;
        this.tempDir = path.join(this.appRootDir, CONFIG.UPDATE_TEMP_DIR || 'tmp_update');
        this.isUpdating = false;
        this.lastCheck = 0;
        this.updateInfo = null;

        // 보존할 대상 (업데이트 시 절대 건드리지 않음)
        this.preserveList = ['config', 'logs', 'tmp_update', '.git', '.DS_Store'];
    }

    /**
     * Get the latest release information from GitHub API based on USER_ROLE
     */
    async getLatestRelease(userRole = 'User') {
        try {
            const url = `https://api.github.com/repos/${this.repo}/releases`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'BlogGenius-Updater' },
                timeout: 5000
            });

            const releases = Array.isArray(response.data) ? response.data : [];
            if (releases.length === 0) return null;

            const role = String(userRole || 'User').trim().toLowerCase();

            if (role === 'developer') {
                // Developer: 무조건 가장 최신(첫 번째) 릴리즈 반환 (Alpha, Dev 등 포함)
                return releases[0];
            } else if (role === 'tester') {
                // Tester: 정식 버전 또는 Beta 버전 중 최신 반환 (Alpha, Dev 제외)
                return releases.find(r =>
                    !r.prerelease ||
                    (r.tag_name.toLowerCase().includes('beta') && !r.tag_name.toLowerCase().includes('alpha') && !r.tag_name.toLowerCase().includes('dev'))
                ) || null;
            } else {
                // User: 오직 정식 버전(prerelease: false)만 반환
                return releases.find(r => !r.prerelease) || null;
            }
        } catch (e) {
            Logger.error(`❌ [Updater] 버전 체크 실패: ${e.message}`);
            return null;
        }
    }

    /**
     * Check if a new version is available
     */
    async checkForUpdate() {
        const now = Date.now();
        if (this.updateInfo && (now - this.lastCheck < 60000)) return this.updateInfo;

        // config.txt의 USER_ROLE 설정(User/Tester/Developer)에 따라 판단
        const latest = await this.getLatestRelease(CONFIG.USER_ROLE);

        if (!latest) return null;

        const latestVersion = latest.tag_name.replace(/^v/, '');
        const isNewer = this.compareVersions(latestVersion, this.currentVersion) > 0;

        // 중요: 에셋(빌드물)이 아직 업로드 중일 수 있으므로, 현재 플랫폼에 맞는 파일이 있는지 확인
        const matchingAsset = this.getPlatformAsset(latest.assets);
        const hasUpdate = isNewer && !!matchingAsset;

        this.lastCheck = now;
        this.updateInfo = {
            hasUpdate,
            isNewer, // 버전 자체는 높지만 에셋이 없을 수 있음
            currentVersion: this.currentVersion,
            latestVersion,
            tagName: latest.tag_name,
            body: latest.body,
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
     * Compare semver strings (Handles prerelease tags like -beta, -alpha)
     */
    compareVersions(v1, v2) {
        const parse = (v) => {
            const [ver, pre] = String(v).replace(/^v/, '').split('-');
            const parts = ver.split('.').map(Number);
            return { parts, pre: pre ? pre.toLowerCase() : null };
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

        // 3. 둘 다 prerelease라면 문자열 비교 (beta > alpha 등, 로직은 단순히 다르면 최신으로 간주하거나 사전순)
        if (sv1.pre !== null && sv2.pre !== null) {
            if (sv1.pre > sv2.pre) return 1;
            if (sv1.pre < sv2.pre) return -1;
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
    async applyUpdate(onProgress = null) {
        if (this.isUpdating) throw new Error('업데이트가 이미 진행 중입니다.');
        if (!this.updateInfo || !this.updateInfo.hasUpdate) throw new Error('업데이트 정보가 없거나 최신 버전입니다.');

        const asset = this.getPlatformAsset(this.updateInfo.assets);
        if (!asset) throw new Error(`현재 플랫폼(${process.platform}-${process.arch})에 맞는 배포 파일을 찾을 수 없습니다.`);

        this.isUpdating = true;
        try {
            if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
            const zipPath = path.join(this.tempDir, 'update.zip');
            const extractDir = path.join(this.tempDir, 'extracted');

            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            fs.mkdirSync(extractDir, { recursive: true });

            Logger.info(`📂 [Updater] 다운로드 시작: ${asset.browser_download_url}`);
            const response = await axios({
                url: asset.browser_download_url,
                method: 'GET',
                responseType: 'stream'
            });

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            const writer = fs.createWriteStream(zipPath);

            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (onProgress) onProgress({ percent: Math.round((downloadedSize / totalSize) * 100), totalSize, downloadedSize });
            });

            await new Promise((resolve, reject) => {
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            Logger.info('📂 [Updater] 압축 해제 중...');
            await this.unzip(zipPath, extractDir);

            // 중요: 압축을 해제한 내용물이 'BlogGenius-v0.8.42-linux-x64' 같이 중첩된 폴더일 수 있음
            let sourceDir = extractDir;
            const entries = fs.readdirSync(extractDir);
            if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
                sourceDir = path.join(extractDir, entries[0]);
                Logger.info(`📂 [Updater] 중첩 폴더 발견: ${entries[0]}`);
            }

            Logger.info('📂 [Updater] 전체 폴더 동기화 업데이트 시작...');
            this.syncFolders(sourceDir, this.appRootDir);

            Logger.info('✅ [Updater] 업데이트 완료! 앱을 재시작해 주세요.');
            return true;
        } catch (e) {
            Logger.error(`❌ [Updater] 업데이트 실패: ${e.message}`);
            throw e;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Recursively sync source folder to target folder, preserving specific items.
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
            const stat = fs.statSync(srcPath);

            if (stat.isDirectory()) {
                // 폴더면 재귀 호출
                this.syncFolders(srcPath, destPath);
            } else {
                // 파일이면 교체
                // 실행 중인 바이너리일 경우 대비 (특히 Windows)
                try {
                    if (fs.existsSync(destPath)) {
                        const backupPath = destPath + '.old';
                        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
                        fs.renameSync(destPath, backupPath);
                    }
                    fs.copyFileSync(srcPath, destPath);
                    if (process.platform !== 'win32') {
                        fs.chmodSync(destPath, '755');
                    }
                } catch (err) {
                    Logger.warn(`⚠️ [Updater] 파일 교체 중 오류 (무시됨): ${item} - ${err.message}`);
                }
            }
        }
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
