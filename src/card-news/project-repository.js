const fs = require('node:fs');
const path = require('node:path');

const CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION = 1;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createCardNewsProjectRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const workspaceDir = String(options.workspaceDir || '').trim();
    if (!workspaceDir) throw new Error('카드뉴스 프로젝트 workspace 경로가 필요합니다.');
    const filePath = options.filePath || pathApi.join(workspaceDir, 'card-news', 'projects.json');

    function readDocument() {
        try {
            if (!fileSystem.existsSync(filePath)) {
                return { schema_version: CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION, projects: [] };
            }
            const parsed = JSON.parse(String(fileSystem.readFileSync(filePath, 'utf8') || ''));
            return {
                schema_version: CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION,
                projects: Array.isArray(parsed?.projects) ? parsed.projects.filter((item) => item?.id) : []
            };
        } catch (error) {
            const wrapped = new Error('카드뉴스 프로젝트 저장소를 읽지 못했습니다.');
            wrapped.code = 'CARD_NEWS_PROJECT_STORE_READ_FAILED';
            wrapped.cause = error;
            throw wrapped;
        }
    }

    function atomicWrite(document) {
        fileSystem.mkdirSync(pathApi.dirname(filePath), { recursive: true });
        const tempPath = pathApi.join(pathApi.dirname(filePath), `.${pathApi.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
        try {
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, filePath);
        } catch (error) {
            try {
                if (fileSystem.existsSync(tempPath)) fileSystem.unlinkSync(tempPath);
            } catch (_cleanupError) { }
            throw error;
        }
    }

    function list() {
        return clone(readDocument().projects).sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
    }

    function get(id) {
        const normalizedId = String(id || '').trim();
        const project = readDocument().projects.find((item) => item.id === normalizedId);
        return project ? clone(project) : null;
    }

    function save(project) {
        if (!project?.id) throw new Error('저장할 카드뉴스 프로젝트 ID가 필요합니다.');
        const document = readDocument();
        const index = document.projects.findIndex((item) => item.id === project.id);
        const nextProject = clone(project);
        if (index >= 0) document.projects[index] = nextProject;
        else document.projects.push(nextProject);
        atomicWrite(document);
        return clone(nextProject);
    }

    return { filePath, list, get, save };
}

module.exports = {
    CARD_NEWS_PROJECT_STORE_SCHEMA_VERSION,
    createCardNewsProjectRepository
};
