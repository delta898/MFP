const CARD_NEWS_PROJECT_SCHEMA_VERSION = 1;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createCardNewsProject(input = {}, options = {}) {
    const now = options.now || (() => new Date().toISOString());
    const createId = options.createId;
    if (typeof createId !== 'function') throw new Error('카드뉴스 프로젝트 ID 생성 기능이 필요합니다.');
    const timestamp = now();
    return {
        schema_version: CARD_NEWS_PROJECT_SCHEMA_VERSION,
        id: String(input.id || createId()).trim(),
        title: String(input.title || input.source_snapshot?.title || '새 카드뉴스').trim().slice(0, 300),
        status: 'draft',
        revision: 1,
        source_snapshot: input.source_snapshot ? clone(input.source_snapshot) : null,
        source_error: null,
        cards: [],
        assets: [],
        created_at: timestamp,
        updated_at: timestamp
    };
}

async function refreshCardNewsProject(project, resolveSnapshot, sourceInput, options = {}) {
    if (!project?.id) throw new Error('카드뉴스 프로젝트가 필요합니다.');
    if (typeof resolveSnapshot !== 'function') throw new Error('카드뉴스 원문 조회 기능이 필요합니다.');
    const now = options.now || (() => new Date().toISOString());
    try {
        const sourceSnapshot = await resolveSnapshot(sourceInput);
        return {
            ...clone(project),
            title: String(project.title || sourceSnapshot.title || '새 카드뉴스').trim().slice(0, 300),
            revision: Number(project.revision || 0) + 1,
            source_snapshot: clone(sourceSnapshot),
            source_error: null,
            updated_at: now()
        };
    } catch (error) {
        return {
            ...clone(project),
            revision: Number(project.revision || 0) + 1,
            source_error: {
                code: String(error?.code || 'CARD_NEWS_SOURCE_REFRESH_FAILED').trim().slice(0, 100),
                message: String(error?.message || '원문을 다시 불러오지 못했습니다.').trim().slice(0, 500),
                occurred_at: now()
            },
            updated_at: now()
        };
    }
}

module.exports = {
    CARD_NEWS_PROJECT_SCHEMA_VERSION,
    createCardNewsProject,
    refreshCardNewsProject
};
