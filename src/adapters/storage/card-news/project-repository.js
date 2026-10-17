const fs = require('node:fs');
const path = require('node:path');

const CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION = 2;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function safeProjectId(value) {
    const normalized = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{1,100}$/.test(normalized) ? normalized : '';
}

function createCardNewsProjectRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const workspaceDir = String(options.workspaceDir || '').trim();
    if (!workspaceDir) throw new Error('카드뉴스 프로젝트 workspace 경로가 필요합니다.');
    const projectsRoot = options.projectsRoot || pathApi.join(workspaceDir, 'card-news', 'projects');
    const legacyFilePath = pathApi.join(workspaceDir, 'card-news', 'projects.json');

    try {
        if (fileSystem.existsSync(legacyFilePath)) fileSystem.unlinkSync(legacyFilePath);
    } catch (error) {
        const wrapped = new Error('이전 카드뉴스 프로젝트 저장소를 정리하지 못했습니다.');
        wrapped.code = 'CARD_NEWS_LEGACY_PROJECT_STORE_DELETE_FAILED';
        wrapped.cause = error;
        throw wrapped;
    }

    function projectFilePath(id) {
        const safeId = safeProjectId(id);
        if (!safeId) {
            const error = new Error('카드뉴스 프로젝트 ID가 올바르지 않습니다.');
            error.code = 'CARD_NEWS_PROJECT_ID_INVALID';
            throw error;
        }
        return pathApi.join(projectsRoot, safeId, 'project.json');
    }

    function readProjectFile(filePath) {
        try {
            const parsed = JSON.parse(String(fileSystem.readFileSync(filePath, 'utf8') || ''));
            return parsed?.id && safeProjectId(parsed.id) ? parsed : null;
        } catch (error) {
            const wrapped = new Error('카드뉴스 프로젝트 저장소를 읽지 못했습니다.');
            wrapped.code = 'CARD_NEWS_PROJECT_STORE_READ_FAILED';
            wrapped.cause = error;
            throw wrapped;
        }
    }

    function list() {
        if (!fileSystem.existsSync(projectsRoot)) return [];
        return fileSystem.readdirSync(projectsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && safeProjectId(entry.name))
            .map((entry) => {
                const filePath = projectFilePath(entry.name);
                return fileSystem.existsSync(filePath) ? readProjectFile(filePath) : null;
            })
            .filter(Boolean)
            .map(clone)
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
    }

    function get(id) {
        const filePath = projectFilePath(id);
        if (!fileSystem.existsSync(filePath)) return null;
        const project = readProjectFile(filePath);
        return project ? clone(project) : null;
    }

    function save(project) {
        const id = safeProjectId(project?.id);
        if (!id) throw new Error('저장할 카드뉴스 프로젝트 ID가 필요합니다.');
        const filePath = projectFilePath(id);
        const directory = pathApi.dirname(filePath);
        const nextProject = {
            ...clone(project),
            id
        };
        fileSystem.mkdirSync(directory, { recursive: true });
        const tempPath = pathApi.join(directory, `.project.json.${process.pid}.${Date.now()}.tmp`);
        try {
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(nextProject, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, filePath);
        } catch (error) {
            try {
                if (fileSystem.existsSync(tempPath)) fileSystem.unlinkSync(tempPath);
            } catch (_cleanupError) { }
            throw error;
        }
        return clone(nextProject);
    }

    return { projectsRoot, legacyFilePath, projectFilePath, list, get, save };
}

module.exports = {
    CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION,
    safeProjectId,
    createCardNewsProjectRepository
};
