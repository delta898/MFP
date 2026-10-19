const MARKER_FILE = '.bloggenius-transient-preview.json';
const DEFAULT_RETENTION_MS = 6 * 60 * 60 * 1000;

function createTransientPreviewWorkspaceManager(options = {}) {
    const fs = options.fs;
    const path = options.path;
    const Logger = options.Logger;
    const workspaceRoot = path.resolve(String(options.workspaceDir || ''));
    const retentionMs = Number.isFinite(Number(options.retentionMs))
        ? Math.max(60 * 1000, Number(options.retentionMs))
        : DEFAULT_RETENTION_MS;

    function ownedDirectory(value) {
        const resolved = path.resolve(String(value || ''));
        return workspaceRoot && resolved !== workspaceRoot && resolved.startsWith(`${workspaceRoot}${path.sep}`)
            ? resolved : '';
    }

    function track(targetDirs = {}, previewId = '') {
        const expiresAt = new Date(Date.now() + retentionMs).toISOString();
        for (const value of new Set(Object.values(targetDirs || {}).filter(Boolean))) {
            const directory = ownedDirectory(value);
            if (!directory || !fs.existsSync(directory)) continue;
            try {
                fs.writeFileSync(path.join(directory, MARKER_FILE), `${JSON.stringify({ previewId, expiresAt })}\n`, { mode: 0o600 });
            } catch (error) {
                Logger?.warn?.(`⚠️ [QuickPreview] 임시 폴더 추적 정보 저장 실패 (${path.basename(directory)}): ${error.message}`);
            }
        }
    }

    function dispose(targetDirs = {}) {
        for (const value of new Set(Object.values(targetDirs || {}).filter(Boolean))) {
            const directory = ownedDirectory(value);
            if (!directory) continue;
            try { fs.rmSync(directory, { recursive: true, force: true }); }
            catch (error) { Logger?.warn?.(`⚠️ [QuickPreview] 임시 생성 폴더 정리 실패 (${path.basename(directory)}): ${error.message}`); }
        }
    }

    function cleanupExpired(nowMs = Date.now()) {
        const summary = { scanned: 0, removed: 0, failed: 0 };
        if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return summary;
        let platformDirs = [];
        try { platformDirs = fs.readdirSync(workspaceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()); }
        catch (error) {
            Logger?.warn?.(`⚠️ [QuickPreview] 임시 폴더 목록 조회 실패: ${error.message}`);
            return { ...summary, failed: 1 };
        }
        for (const platform of platformDirs) {
            const platformRoot = path.join(workspaceRoot, platform.name);
            let candidates = [];
            try { candidates = fs.readdirSync(platformRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()); }
            catch (_) { continue; }
            for (const candidate of candidates) {
                const directory = path.join(platformRoot, candidate.name);
                const markerPath = path.join(directory, MARKER_FILE);
                if (!fs.existsSync(markerPath)) continue;
                summary.scanned += 1;
                try {
                    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
                    const expiresAtMs = Date.parse(String(marker.expiresAt || ''));
                    if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) continue;
                    fs.rmSync(directory, { recursive: true, force: true });
                    summary.removed += 1;
                } catch (error) {
                    summary.failed += 1;
                    Logger?.warn?.(`⚠️ [QuickPreview] 만료 임시 폴더 정리 실패 (${candidate.name}): ${error.message}`);
                }
            }
        }
        if (summary.removed > 0 || summary.failed > 0) {
            Logger?.info?.(`🧹 [QuickPreview] 임시 생성 폴더 정리 완료 (scanned=${summary.scanned}, removed=${summary.removed}, failed=${summary.failed})`);
        }
        return summary;
    }

    return { track, dispose, cleanupExpired };
}

module.exports = { createTransientPreviewWorkspaceManager, MARKER_FILE };
