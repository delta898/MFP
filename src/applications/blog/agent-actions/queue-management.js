'use strict';

function toTopicLines(items = [], emptyMessage = '항목이 없습니다.') {
    if (!Array.isArray(items) || items.length === 0) return emptyMessage;
    return items.map((item, index) => {
        const subject = String(item?.subject || item?.title || '제목 없는 글감').trim();
        const keywords = Array.isArray(item?.keywords) ? item.keywords.filter(Boolean).join(', ') : String(item?.keywordsRaw || '').trim();
        const row = Number.isInteger(Number(item?.rowNumber)) ? ` (#${Number(item.rowNumber)})` : '';
        return `${index + 1}. ${subject}${row}${keywords ? ` — 키워드: ${keywords}` : ''}`;
    }).join('\n');
}

function createBlogQueueManagementCapabilities(deps = {}) {
    const application = deps.blogQueueManagementApplication;
    const capabilities = [];
    if (application?.supportsQueueListing === true) capabilities.push(
        {
            id: 'content.queue.list_topics',
            type: 'content.query',
            domain: 'content.queue',
            effect: 'read_only',
            confirmPolicy: 'never',
            agentExposure: {
                kind: 'application_workflow',
                category: '블로그 글감',
                title: '글감 저장소와 발행 대기열 조회',
                description: 'Google Sheets에 저장된 블로그 글감 중 보관함이나 발행 대기열 항목을 조회합니다.',
                useWhen: '사용자가 저장된 글감 또는 발행 대기열 목록을 보여 달라고 합니다.',
                avoidWhen: '사용자가 개인화 기억이나 대화 기록을 조회하거나 글감 자체를 변경하라고 합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        scope: { type: 'string', enum: ['queue', 'saved', 'all'] },
                        limit: { type: 'integer', minimum: 1, maximum: 20 }
                    },
                    additionalProperties: false
                },
                parameterSemantics: {
                    scope: { role: 'selection' },
                    limit: { role: 'quantity' }
                },
                outputDescription: '저장된 글감 제목, 키워드, 목록 구분을 반환합니다.',
                examples: ['발행 대기열에 있는 항목을 보여줘', '글감 저장소에 등록된 주제를 보여줘']
            },
            validate(params = {}) {
                const scope = String(params.scope || 'all').trim();
                const errors = ['queue', 'saved', 'all'].includes(scope) ? [] : ['조회 범위를 확인해 주세요.'];
                const requestedLimit = Number(params.limit ?? 10);
                const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 10;
                return { ok: errors.length === 0, errors, normalizedParams: { scope, limit } };
            },
            async preview(params = {}) {
                const scope = String(params.scope || 'all').trim();
                return { summary: `${scope === 'queue' ? '발행 대기열' : scope === 'saved' ? '보관함' : '글감 저장소와 발행 대기열'}을 조회합니다.`, before: {}, after: { scope } };
            },
            async execute(params = {}) {
                const scope = String(params.scope || 'all').trim();
                const limit = Math.max(1, Math.min(20, Number(params.limit) || 10));
                const overview = await application.getReadyQueue({ limit });
                const queueItems = Array.isArray(overview?.items) ? overview.items : [];
                const savedItems = Array.isArray(overview?.saved_items) ? overview.saved_items : [];
                const sections = [];
                if (scope === 'queue' || scope === 'all') {
                    sections.push(`발행 대기열 (${queueItems.length}건)\n${toTopicLines(queueItems, '대기 중인 글감이 없습니다.')}`);
                }
                if (scope === 'saved' || scope === 'all') {
                    sections.push(`글감 저장소 (${savedItems.length}건)\n${toTopicLines(savedItems, '보관된 글감이 없습니다.')}`);
                }
                return {
                    success: true,
                    message: sections.join('\n\n'),
                    data: { scope, items: { queue: queueItems, saved: savedItems } },
                    sideEffects: []
                };
            }
        }
    );
    if (application?.supportsTopicMoving === true) capabilities.push(
        {
            id: 'content.queue.move_topic',
            type: 'content.update',
            domain: 'content.queue',
            effect: 'local_change',
            confirmPolicy: 'never',
            agentExposure: {
                kind: 'application_workflow',
                category: '블로그 글감',
                title: '글감을 보관함과 발행 대기열 사이에서 이동',
                description: '주제가 일치하는 글감 하나를 발행 대기열에서 보관함으로, 또는 보관함에서 발행 대기열로 이동합니다.',
                useWhen: '사용자가 특정 블로그 글감을 보관함에 넣거나 발행 대기열에 추가·제외하라고 합니다.',
                avoidWhen: '사용자가 글감 내용을 편집하거나 삭제·즉시 발행하라고 합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', minLength: 1, maxLength: 500 },
                        rowNumber: { type: 'integer', minimum: 2 },
                        source: { type: 'string', enum: ['queue', 'saved'] },
                        destination: { type: 'string', enum: ['queue', 'saved'] }
                    },
                    required: ['source', 'destination'],
                    anyOf: [{ required: ['subject'] }, { required: ['rowNumber'] }],
                    additionalProperties: false
                },
                parameterSemantics: {
                    subject: { role: 'explicit_constraint' },
                    rowNumber: { role: 'selection' },
                    source: { role: 'selection' },
                    destination: { role: 'selection' }
                },
                outputDescription: '이동한 글감과 이동 전·후 목록을 반환합니다.',
                examples: ['“가을 여행” 글감을 발행 대기열에서 보관함으로 옮겨줘', '“가을 여행” 글감을 보관함에서 발행 대기열에 넣어줘']
            },
            validate(params = {}) {
                const subject = String(params.subject || '').trim();
                const rowNumber = Number(params.rowNumber);
                const source = String(params.source || '').trim();
                const destination = String(params.destination || '').trim();
                const errors = [];
                if (!subject && (!Number.isInteger(rowNumber) || rowNumber < 2)) errors.push('옮길 글감의 주제나 목록 번호가 필요합니다. 목록에서 항목을 확인해 주세요.');
                if (!['queue', 'saved'].includes(source) || !['queue', 'saved'].includes(destination) || source === destination) {
                    errors.push('글감의 현재 위치와 옮길 위치를 확인해 주세요.');
                }
                return { ok: errors.length === 0, errors, normalizedParams: { subject, rowNumber: Number.isInteger(rowNumber) ? rowNumber : undefined, source, destination } };
            },
            async preview(params = {}) {
                const source = String(params.source || '').trim();
                const destination = String(params.destination || '').trim();
                const location = value => value === 'queue' ? '발행 대기열' : '글감 저장소';
                const selectedTopic = String(params.subject || '').trim() || `행 ${Number(params.rowNumber || 0)}`;
                return {
                    summary: `“${selectedTopic}” 글감을 ${location(source)}에서 ${location(destination)}으로 이동합니다.`,
                    before: { location: location(source) },
                    after: { location: location(destination) }
                };
            },
            async execute(params = {}) {
                const moved = await application.moveTopic(params);
                const destination = moved.destination === 'queue' ? '발행 대기열' : '글감 저장소';
                return {
                    success: true,
                    message: `“${moved.subject}” 글감${moved.rowNumber ? ` (#${moved.rowNumber})` : ''}을 ${destination}(으)로 옮겼습니다.`,
                    data: moved,
                    sideEffects: ['topic_status_updated']
                };
            }
        }
    );
    if (application?.supportsTopicUpdating === true) capabilities.push(
        {
            id: 'content.queue.update_topic',
            type: 'content.update',
            domain: 'content.queue',
            effect: 'local_change',
            confirmPolicy: 'never',
            agentExposure: {
                kind: 'application_workflow',
                category: '블로그 글감',
                title: '저장된 글감 내용과 발행 설정 수정',
                description: '보관함 또는 발행 대기열에 있는 블로그 글감의 주제, 키워드, 참고자료, 발행 대상과 글쓰기 설정을 수정합니다. 말하지 않은 기존 값은 유지합니다.',
                useWhen: '사용자가 기존 글감의 키워드, 발행 대상, 카테고리, 이미지, 참고자료, 글쓰기 방식, 예약 방식 또는 주제를 바꾸라고 합니다.',
                avoidWhen: '새 글감을 만들거나 글감을 다른 목록으로 옮기거나 삭제·발행하라고 합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        subject: { type: 'string', minLength: 1, maxLength: 500 },
                        rowNumber: { type: 'integer', minimum: 2 },
                        location: { type: 'string', enum: ['any', 'queue', 'saved'] },
                        newSubject: { type: 'string', minLength: 1, maxLength: 500 },
                        title: { type: 'string', maxLength: 500 },
                        keywords: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 30 },
                        instruction: { type: 'string', maxLength: 5000 },
                        referenceUrls: { type: 'array', items: { type: 'string', maxLength: 2000 }, maxItems: 20 },
                        platforms: { type: 'array', items: { type: 'string', enum: ['naver', 'wordpress', 'site-hosting'] }, minItems: 1, maxItems: 1 },
                        naverCategory: { type: 'string', maxLength: 200 },
                        wordpressCategory: { type: 'string', maxLength: 200 },
                        writingStrategy: { type: 'string', enum: ['search', 'discovery'] },
                        imageMode: { type: 'string', enum: ['none', 'prompt_only', 'generate'] },
                        externalReference: { type: 'boolean' },
                        postStatus: { type: 'string', enum: ['publish', 'draft', 'schedule'] },
                        scheduleDate: { type: 'string', maxLength: 100 }
                    },
                    required: [],
                    allOf: [
                        { anyOf: [{ required: ['subject'] }, { required: ['rowNumber'] }] },
                        { anyOf: [
                            { required: ['newSubject'] }, { required: ['title'] }, { required: ['keywords'] },
                            { required: ['instruction'] }, { required: ['referenceUrls'] }, { required: ['platforms'] },
                            { required: ['naverCategory'] }, { required: ['wordpressCategory'] },
                            { required: ['writingStrategy'] }, { required: ['imageMode'] },
                            { required: ['externalReference'] }, { required: ['postStatus'] }, { required: ['scheduleDate'] }
                        ] }
                    ],
                    additionalProperties: false
                },
                parameterSemantics: {
                    subject: { role: 'explicit_constraint' }, rowNumber: { role: 'selection' }, location: { role: 'selection' },
                    newSubject: { role: 'explicit_constraint' }, title: { role: 'explicit_constraint' },
                    keywords: { role: 'explicit_constraint' }, platforms: { role: 'selection' }, postStatus: { role: 'selection' }
                },
                outputDescription: '수정한 글감과 변경된 설정을 반환합니다.',
                examples: [
                    '발행 대기열에 있는 “가을 여행” 글감의 발행 대상을 네이버 블로그에서 워드프레스로 바꿔줘',
                    '보관함의 “가을 여행” 글감에 키워드 “오사카, 교토”를 추가해줘',
                    '“가을 여행” 글감의 제목을 “가을에 떠나는 일본 여행”으로 바꿔줘'
                ]
            },
            validate(params = {}) {
                const subject = String(params.subject || '').trim();
                const rowNumber = Number(params.rowNumber);
                const location = String(params.location || 'any').trim();
                const errors = [];
                if (!subject && (!Number.isInteger(rowNumber) || rowNumber < 2)) errors.push('수정할 글감의 주제나 목록 번호가 필요합니다.');
                if (!['any', 'queue', 'saved'].includes(location)) errors.push('글감의 현재 위치를 확인해 주세요.');
                const editable = ['newSubject', 'title', 'keywords', 'instruction', 'referenceUrls', 'platforms', 'naverCategory', 'wordpressCategory', 'writingStrategy', 'imageMode', 'externalReference', 'postStatus', 'scheduleDate'];
                if (!editable.some(key => Object.prototype.hasOwnProperty.call(params, key))) errors.push('변경할 글감 정보가 필요합니다.');
                if (Object.prototype.hasOwnProperty.call(params, 'platforms')
                    && (!Array.isArray(params.platforms) || params.platforms.length !== 1 || !['naver', 'wordpress', 'site-hosting'].includes(params.platforms[0]))) {
                    errors.push('발행 대상은 네이버 블로그, WordPress, 사이트 중 하나만 선택할 수 있습니다.');
                }
                if (Object.prototype.hasOwnProperty.call(params, 'postStatus') && !['publish', 'draft', 'schedule'].includes(params.postStatus)) errors.push('발행 방식을 확인해 주세요.');
                if (Object.prototype.hasOwnProperty.call(params, 'imageMode') && !['none', 'prompt_only', 'generate'].includes(params.imageMode)) errors.push('이미지 설정을 확인해 주세요.');
                if (Object.prototype.hasOwnProperty.call(params, 'writingStrategy') && !['search', 'discovery'].includes(params.writingStrategy)) errors.push('글쓰기 방식을 확인해 주세요.');
                if (params.postStatus === 'schedule' && !String(params.scheduleDate || '').trim()) errors.push('예약 발행으로 바꾸려면 예약 일시도 지정해 주세요.');
                return { ok: errors.length === 0, errors, normalizedParams: { ...params, subject, rowNumber: Number.isInteger(rowNumber) ? rowNumber : undefined, location } };
            },
            async preview(params = {}) {
                const changes = [];
                const labels = { newSubject: '주제', title: '제목', keywords: '키워드', instruction: '지시사항', referenceUrls: '참고 URL', platforms: '발행 대상', naverCategory: '네이버 카테고리', wordpressCategory: 'WordPress 카테고리', writingStrategy: '글쓰기 방식', imageMode: '이미지 설정', externalReference: '외부 자료 참고', postStatus: '발행 방식', scheduleDate: '예약 일시' };
                for (const [key, label] of Object.entries(labels)) {
                    if (Object.prototype.hasOwnProperty.call(params, key)) {
                        const value = Array.isArray(params[key]) ? params[key].join(', ') : String(params[key]);
                        changes.push(`${label}: ${value}`);
                    }
                }
                return { summary: `“${params.subject || `#${params.rowNumber}`}” 글감의 ${changes.join(' / ')}을(를) 수정합니다.`, before: {}, after: { changes } };
            },
            async execute(params = {}) {
                const updates = { ...params };
                delete updates.subject;
                delete updates.rowNumber;
                delete updates.location;
                const updated = await application.updateTopicDetails({ ...params, ...updates, subject: params.subject, rowNumber: params.rowNumber });
                return {
                    success: true,
                    message: `“${updated.subject}” 글감 (#${updated.rowNumber})을 수정했습니다. 기존에 말하지 않은 설정은 유지했습니다.`,
                    data: updated,
                    sideEffects: ['topic_content_updated']
                };
            }
        }
    );
    return capabilities;
}

module.exports = { createBlogQueueManagementCapabilities };
