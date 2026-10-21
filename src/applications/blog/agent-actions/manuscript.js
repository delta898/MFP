'use strict';

const { getInternalUiOrigin } = require('../../../utilities/network/internal-ui-origin');

const TARGETS = Object.freeze(['naver', 'wordpress']);
const POST_STATUSES = Object.freeze(['draft', 'publish', 'schedule']);

function normalizeTarget(value, fallback = '') {
    const target = String(value || fallback).trim().toLowerCase();
    return TARGETS.includes(target) ? target : '';
}

function normalizeGenerateParams(params = {}) {
    const subject = String(params.subject || '').trim();
    const target = normalizeTarget(params.target, 'naver');
    const imageMode = String(params.image_mode ?? params.imageMode ?? 'prompt_only').trim().toLowerCase();
    return {
        subject,
        target,
        keywords: Array.isArray(params.keywords)
            ? params.keywords.map((item) => String(item || '').trim()).filter(Boolean)
            : String(params.keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
        instruction: String(params.instruction || '').trim(),
        externalReference: (params.external_reference ?? params.externalReference) === true,
        imageMode: ['none', 'prompt_only', 'generate'].includes(imageMode) ? imageMode : 'prompt_only',
        naverCategory: String(params.naver_category ?? params.naverCategory ?? '').trim(),
        wordpressCategory: String(params.wordpress_category ?? params.wordpressCategory ?? '').trim(),
        savedTopicRowNumber: Number(params.saved_topic_row_number ?? params.savedTopicRowNumber) || null
    };
}

function normalizePublishParams(params = {}) {
    const target = normalizeTarget(params.target);
    const postStatus = String(params.post_status ?? params.postStatus ?? 'draft').trim().toLowerCase();
    const scheduleDate = String(params.schedule_date ?? params.scheduleDate ?? '').trim();
    return {
        draftId: String(params.draft_id ?? params.draftId ?? '').trim(),
        revision: Number(params.revision),
        target,
        postStatus: POST_STATUSES.includes(postStatus) ? postStatus : '',
        scheduleDate,
        naverCategory: String(params.naver_category ?? params.naverCategory ?? '').trim(),
        wordpressCategory: String(params.wordpress_category ?? params.wordpressCategory ?? '').trim()
    };
}

function validateGenerate(params = {}) {
    const normalizedParams = normalizeGenerateParams(params);
    const errors = [];
    if (!normalizedParams.subject && !normalizedParams.savedTopicRowNumber) errors.push('글의 주제나 글감 저장소의 행 번호를 알려주세요.');
    if (!normalizedParams.target) errors.push('발행 대상을 네이버 블로그 또는 워드프레스로 지정해 주세요.');
    if (!['none', 'prompt_only', 'generate'].includes(String(params.image_mode ?? params.imageMode ?? 'prompt_only').trim().toLowerCase())) {
        errors.push('이미지 방식은 none, prompt_only, generate 중 하나여야 합니다.');
    }
    return { ok: errors.length === 0, errors, normalizedParams };
}

function validatePublish(params = {}) {
    const normalizedParams = normalizePublishParams(params);
    const errors = [];
    if (!normalizedParams.draftId) errors.push('발행할 원고 ID가 필요합니다.');
    if (!Number.isInteger(normalizedParams.revision) || normalizedParams.revision < 1) errors.push('원고 버전 정보가 필요합니다.');
    if (!normalizedParams.target) errors.push('발행 대상을 네이버 블로그 또는 워드프레스로 지정해 주세요.');
    if (!normalizedParams.postStatus) errors.push('발행 상태는 임시저장, 즉시발행, 예약발행 중 하나여야 합니다.');
    if (normalizedParams.postStatus === 'schedule' && !normalizedParams.scheduleDate) errors.push('예약 발행 일시를 지정해 주세요.');
    return { ok: errors.length === 0, errors, normalizedParams };
}

function validateGenerateAndPublish(params = {}) {
    const generation = validateGenerate(params);
    const target = normalizeTarget(params.target);
    const postStatus = String(params.post_status ?? params.postStatus ?? '').trim().toLowerCase();
    const scheduleDate = String(params.schedule_date ?? params.scheduleDate ?? '').trim();
    const errors = [...generation.errors];
    if (!POST_STATUSES.includes(postStatus)) errors.push('임시저장, 예약발행, 즉시 게시 중 발행 상태를 지정해 주세요.');
    if (postStatus === 'schedule' && !scheduleDate) errors.push('예약 발행 일시를 지정해 주세요.');
    return {
        ok: errors.length === 0,
        errors,
        normalizedParams: { ...generation.normalizedParams, postStatus, scheduleDate, target }
    };
}

function getResponseData(response) {
    return response?.data?.data ?? response?.data ?? {};
}

function createBlogManuscriptCapabilities(deps = {}) {
    const axios = deps.axios || require('axios');
    const CONFIG = deps.CONFIG || {};
    const Logger = deps.Logger || require('../../../utilities/logging/logger');
    const origin = getInternalUiOrigin(CONFIG);

    async function resolveGenerateInput(rawParams = {}) {
        const topicRowNumber = Number(rawParams.saved_topic_row_number ?? rawParams.savedTopicRowNumber);
        const hasTopicRowNumber = Number.isInteger(topicRowNumber) && topicRowNumber >= 2;
        let sourceTopic = null;
        const topicApplication = deps.blogQueueManagementApplication;
        if (typeof topicApplication?.findSavedTopicForWriting === 'function') {
            try {
                const { match, matches } = await topicApplication.findSavedTopicForWriting({
                    subject: rawParams.subject,
                    ...(hasTopicRowNumber ? { rowNumber: topicRowNumber } : {})
                });
                if (hasTopicRowNumber && !match) throw new Error(`글감 저장소에서 ${topicRowNumber}번 행의 일치하는 글감을 찾지 못했습니다.`);
                if (hasTopicRowNumber || matches.length === 1) sourceTopic = match;
            } catch (error) {
                if (hasTopicRowNumber) throw error;
                Logger?.warn?.(`[Agent][Manuscript] saved topic lookup unavailable; continuing without topic reuse code=${String(error?.apiCode || error?.code || error?.name || 'LOOKUP_FAILED').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)}`);
            }
        } else if (hasTopicRowNumber) {
            throw new Error('저장된 글감 저장소를 확인할 수 없어 지정한 글감을 연결하지 못했습니다.');
        }

        const topicOptions = sourceTopic?.options || {};
        const topicGuide = sourceTopic?.content_guide || {};
        const storedPlatforms = Array.isArray(topicOptions.platforms) ? topicOptions.platforms : [];
        const storedTarget = storedPlatforms.find(value => TARGETS.includes(String(value || '').trim().toLowerCase()));
        const storedInstruction = String(topicGuide.additional_instructions || '').trim();
        const requestedInstruction = String(rawParams.instruction ?? rawParams.additional_instructions ?? '').trim();
        const combinedInstruction = [storedInstruction, requestedInstruction]
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join('\n\n');
        const mergedParams = {
            ...rawParams,
            subject: String(rawParams.subject || sourceTopic?.subject || '').trim(),
            ...(rawParams.target === undefined && storedTarget ? { target: storedTarget } : {}),
            ...(rawParams.keywords === undefined && Array.isArray(sourceTopic?.keywords) ? { keywords: sourceTopic.keywords } : {}),
            ...(combinedInstruction ? { instruction: combinedInstruction } : {}),
            ...(rawParams.external_reference === undefined && rawParams.externalReference === undefined && sourceTopic
                ? { external_reference: sourceTopic.external_reference !== false }
                : {}),
            ...(rawParams.image_mode === undefined && rawParams.imageMode === undefined && sourceTopic?.image_mode
                ? { image_mode: sourceTopic.image_mode }
                : {}),
            ...(rawParams.naver_category === undefined && rawParams.naverCategory === undefined
                && (topicOptions.naver_category || topicOptions.naverCategory)
                ? { naver_category: topicOptions.naver_category || topicOptions.naverCategory }
                : {}),
            ...(rawParams.wordpress_category === undefined && rawParams.wordpressCategory === undefined
                && (topicOptions.wordpress_category || topicOptions.wordpressCategory)
                ? { wordpress_category: topicOptions.wordpress_category || topicOptions.wordpressCategory }
                : {})
        };
        return {
            params: normalizeGenerateParams(mergedParams),
            sourceTopic: sourceTopic ? { rowNumber: Number(sourceTopic.rowNumber), subject: String(sourceTopic.subject || '') } : null
        };
    }

    async function generate(params) {
        const response = await axios.post(`${origin}/api/v1/blog/manuscript-drafts/ai`, {
            subject: params.subject,
            keywords: params.keywords,
            instruction: params.instruction,
            externalReference: params.externalReference,
            imageMode: params.imageMode,
            naverCategory: params.naverCategory,
            wordpressCategory: params.wordpressCategory,
            targets: [params.target],
            postStatus: 'draft'
        });
        const draft = getResponseData(response);
        if (!draft.draftId || !Number.isInteger(Number(draft.revision))) {
            throw new Error('AI 원고는 생성했지만 저장된 원고 작업을 확인하지 못했습니다.');
        }
        return draft;
    }

    async function publish(params) {
        const settingsResponse = await axios.post(
            `${origin}/api/v1/blog/manuscript-drafts/${encodeURIComponent(params.draftId)}/settings`,
            {
                draftId: params.draftId,
                revision: params.revision,
                targets: [params.target],
                postStatus: params.postStatus,
                scheduleDate: params.scheduleDate,
                naverCategory: params.naverCategory,
                wordpressCategory: params.wordpressCategory
            }
        );
        const updatedDraft = getResponseData(settingsResponse);
        const revision = Number(updatedDraft.revision || params.revision);
        const response = await axios.post(
            `${origin}/api/v1/blog/manuscript-drafts/${encodeURIComponent(params.draftId)}/publish`,
            {
                draftId: params.draftId,
                revision,
                postStatus: params.postStatus,
                scheduleDate: params.scheduleDate
            }
        );
        return getResponseData(response);
    }

    const targetSchema = { type: 'string', enum: TARGETS };
    const statusSchema = { type: 'string', enum: POST_STATUSES };
    const generateSchema = {
        type: 'object',
        properties: {
            subject: { type: 'string', minLength: 1, maxLength: 500 },
            target: targetSchema,
            keywords: { oneOf: [{ type: 'string', maxLength: 1000 }, { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 20 }] },
            instruction: { type: 'string', maxLength: 3000 },
            external_reference: { type: 'boolean' },
            image_mode: { type: 'string', enum: ['none', 'prompt_only', 'generate'] },
            saved_topic_row_number: { type: 'integer', minimum: 2 },
            naver_category: { type: 'string', maxLength: 120 },
            wordpress_category: { type: 'string', maxLength: 120 }
        },
        required: ['target'],
        anyOf: [{ required: ['subject'] }, { required: ['saved_topic_row_number'] }],
        additionalProperties: false
    };
    const publishSchema = {
        type: 'object',
        properties: {
            draft_id: { type: 'string', minLength: 1, maxLength: 100 },
            revision: { type: 'integer', minimum: 1 },
            target: targetSchema,
            post_status: statusSchema,
            schedule_date: { type: 'string', maxLength: 100 },
            naver_category: { type: 'string', maxLength: 120 },
            wordpress_category: { type: 'string', maxLength: 120 }
        },
        required: ['draft_id', 'revision', 'target', 'post_status'],
        additionalProperties: false
    };
    const generateAndPublishSchema = {
        type: 'object',
        properties: {
            subject: { type: 'string', minLength: 1, maxLength: 500 },
            target: targetSchema,
            post_status: statusSchema,
            schedule_date: { type: 'string', maxLength: 100 },
            keywords: generateSchema.properties.keywords,
            instruction: generateSchema.properties.instruction,
            external_reference: generateSchema.properties.external_reference,
            image_mode: generateSchema.properties.image_mode,
            saved_topic_row_number: generateSchema.properties.saved_topic_row_number,
            naver_category: generateSchema.properties.naver_category,
            wordpress_category: generateSchema.properties.wordpress_category
        },
        required: ['target', 'post_status'],
        anyOf: [{ required: ['subject'] }, { required: ['saved_topic_row_number'] }],
        additionalProperties: false
    };

    const generationAction = {
        id: 'content.manuscript.generate',
        type: 'content.generate',
        domain: 'content.manuscript',
        name: 'generate',
        effect: 'local_change',
        confirmPolicy: 'never',
        agentExposure: {
            kind: 'atomic',
            category: '블로그 원고',
            title: '블로그 원고 생성',
            description: 'AI로 원고를 작성해 BlogGenius 원고 작업공간에 저장합니다. 주제가 보관된 글감과 정확히 일치하면 저장된 글감 설정을 이어받으며, 글감 행 번호를 알고 있으면 지정할 수 있습니다.',
            useWhen: '사용자가 원고 작성이나 초안을 요청하고 외부 발행은 요청하지 않습니다.',
            avoidWhen: '사용자가 바로 외부 블로그에 임시저장, 예약발행 또는 게시까지 요청합니다. 이 경우 생성·발행 workflow를 사용합니다.',
            inputSchema: generateSchema,
            inputPolicy: {
                subject: { kind: 'required', question: '어떤 주제로 원고를 작성할까요? 글감 저장소의 행 번호를 지정해도 됩니다.' },
                keywords: { kind: 'optional', prompt: '검색 키워드를 알려주시면 원고에 반영할 수 있습니다.', label: '키워드', example: '예: OpenClaw' },
                image_mode: { kind: 'optional', prompt: '이미지 방식은 기본적으로 프롬프트만 포함합니다. 이미지 생성이나 미포함을 원하면 지정해 주세요.', label: '이미지 생성', choices: ['미포함', '프롬프트만', '생성'] },
                external_reference: { kind: 'optional', prompt: '외부 참고 자료를 활용할지 지정할 수 있습니다.', label: '외부 참고', choices: ['사용', '사용 안 함'] },
                instruction: { kind: 'optional', prompt: '원고에 반영할 추가 요청이 있으면 알려주세요.', label: '추가 요청', example: '선택' },
                naver_category: { kind: 'optional', prompt: '네이버 카테고리를 지정할 수 있습니다.', label: '네이버 카테고리', example: '선택' },
                wordpress_category: { kind: 'optional', prompt: '워드프레스 카테고리를 지정할 수 있습니다.', label: '워드프레스 카테고리', example: '선택' }
            },
            parameterSemantics: { saved_topic_row_number: { role: 'selection' } },
            outputDescription: '생성된 원고 작업공간의 ID와 제목을 반환합니다.',
            examples: ['OpenClaw 활용법 10선을 주제로 네이버 블로그 원고 초안 써줘', '글감 저장소 #96 글감의 설정을 활용해 원고를 써줘']
        },
        validate: validateGenerate,
        async preview(params = {}) {
            const resolved = await resolveGenerateInput(params);
            const normalized = resolved.params;
            return {
                kind: 'manuscript_generation',
                summary: `AI 원고를 생성해 BlogGenius 원고 작업공간에 저장합니다.${resolved.sourceTopic ? ` 글감 저장소 #${resolved.sourceTopic.rowNumber}의 설정을 활용합니다.` : ''}`,
                subject: normalized.subject, target: normalized.target, keywords: normalized.keywords,
                image_mode: normalized.imageMode, external_reference: normalized.externalReference,
                ...(resolved.sourceTopic ? { source_topic: resolved.sourceTopic } : {})
            };
        },
        async execute(params = {}) {
            const resolved = await resolveGenerateInput(params);
            const draft = await generate(resolved.params);
            const title = String(draft.title || draft.subject || '제목 미정').trim();
            return {
                success: true,
                message: `“${title}” 원고를 생성해 BlogGenius 작업공간에 저장했습니다.${resolved.sourceTopic ? ` 글감 저장소 #${resolved.sourceTopic.rowNumber}의 설정을 활용했습니다.` : ''} 원고 ID: ${draft.draftId} (버전 ${draft.revision}). 외부 블로그에는 발행하지 않았습니다.`,
                data: { draftId: draft.draftId, revision: draft.revision, title, ...(resolved.sourceTopic ? { sourceTopic: resolved.sourceTopic } : {}) },
                sideEffects: ['manuscript_draft_created']
            };
        }
    };

    const publishAction = {
        id: 'content.manuscript.publish',
        type: 'content.publish',
        domain: 'content.manuscript',
        name: 'publish',
        effect: 'external_side_effect',
        confirmPolicy: 'required',
        agentExposure: {
            kind: 'atomic',
            category: '블로그 원고',
            title: '저장된 원고 발행',
            description: '이미 생성된 BlogGenius 원고를 네이버 블로그 또는 워드프레스에 임시저장, 예약발행 또는 즉시 게시합니다.',
            useWhen: '사용자가 기존 원고 작업을 외부 블로그로 전달하길 요청합니다.',
            avoidWhen: '원고가 아직 없고 이번 요청에서 새 원고 작성도 요청합니다. 이 경우 생성·발행 workflow를 사용합니다.',
            inputSchema: publishSchema,
            inputPolicy: {
                draft_id: { kind: 'required', question: '어떤 원고를 발행할까요?' },
                revision: { kind: 'required', question: '최신 원고 버전을 확인할 수 없습니다. 원고를 다시 선택해 주세요.' },
                target: { kind: 'required', question: '발행 대상을 네이버 블로그와 워드프레스 중 어디로 할까요?' },
                post_status: { kind: 'required', question: '임시저장, 예약발행, 즉시 게시 중 어떤 방식으로 할까요?' },
                naver_category: { kind: 'optional', prompt: '네이버 카테고리를 지정할 수 있습니다.', label: '네이버 카테고리', example: '선택' },
                wordpress_category: { kind: 'optional', prompt: '워드프레스 카테고리를 지정할 수 있습니다.', label: '워드프레스 카테고리', example: '선택' }
            },
            outputDescription: '저장한 발행 설정과 대상 블로그의 결과를 반환합니다.',
            examples: ['선택한 원고를 네이버 블로그에 임시저장해줘']
        },
        validate: validatePublish,
        async preview(params = {}) {
            const normalized = normalizePublishParams(params);
            return { kind: 'manuscript_publication', summary: `${normalized.target === 'wordpress' ? '워드프레스' : '네이버 블로그'}에 ${normalized.postStatus === 'draft' ? '임시저장' : normalized.postStatus === 'schedule' ? '예약발행' : '즉시 게시'}합니다.`, target: normalized.target, post_status: normalized.postStatus };
        },
        async execute(params = {}) {
            const result = await publish(normalizePublishParams(params));
            const normalized = normalizePublishParams(params);
            const targetLabel = normalized.target === 'wordpress' ? '워드프레스' : '네이버 블로그';
            const statusLabel = normalized.postStatus === 'draft' ? '임시저장' : normalized.postStatus === 'schedule' ? '예약발행' : '게시';
            return {
                success: result.success !== false,
                message: result.success === false ? (result.message || '원고 발행에 실패했습니다.') : `${targetLabel} ${statusLabel}을 완료했습니다.`,
                data: result,
                sideEffects: result.success === false ? [] : ['manuscript_published']
            };
        }
    };

    const workflowAction = {
        id: 'content.manuscript.generate_and_publish',
        type: 'content.publish',
        domain: 'content.manuscript',
        name: 'generate_and_publish',
        effect: 'external_side_effect',
        confirmPolicy: 'required',
        agentExposure: {
            kind: 'application_workflow',
            category: '블로그 원고',
            title: '원고 작성 후 블로그에 전달',
            description: '원고 생성과 블로그 전달을 독립 단계로 실행합니다. 같은 주제의 보관 글감이 있으면 저장된 설정을 이어받고, 먼저 BlogGenius 원고 작업공간에 저장한 뒤 지정한 대상과 상태로 전달합니다.',
            useWhen: '사용자가 주제로 원고를 작성해 네이버 블로그나 워드프레스에 임시저장, 예약발행 또는 게시까지 요청합니다.',
            avoidWhen: '사용자가 원고만 요청하거나, 이미 저장된 원고의 발행만 요청합니다.',
            inputSchema: generateAndPublishSchema,
            inputPolicy: {
                subject: { kind: 'required', question: '어떤 주제로 작성할까요? 글감 저장소의 행 번호를 지정해도 됩니다.' },
                target: { kind: 'required', question: '발행 대상을 네이버 블로그와 워드프레스 중 어디로 할까요?' },
                post_status: { kind: 'required', question: '임시저장, 예약발행, 즉시 게시 중 어떤 방식으로 할까요?' },
                keywords: { kind: 'optional', prompt: '검색 키워드를 알려주시면 원고에 반영할 수 있습니다.', label: '키워드', example: '예: OpenClaw' },
                image_mode: { kind: 'optional', prompt: '이미지 방식은 기본적으로 프롬프트만 포함합니다. 이미지 생성이나 미포함을 원하면 지정해 주세요.', label: '이미지 생성', choices: ['미포함', '프롬프트만', '생성'] },
                external_reference: { kind: 'optional', prompt: '외부 참고 자료를 활용할지 지정할 수 있습니다.', label: '외부 참고', choices: ['사용', '사용 안 함'] },
                instruction: { kind: 'optional', prompt: '추가 요청이 있으면 원고 작성에 반영할 수 있습니다.', label: '추가 요청', example: '선택' },
                naver_category: { kind: 'optional', prompt: '네이버 카테고리를 지정할 수 있습니다.', label: '네이버 카테고리', example: '선택' },
                wordpress_category: { kind: 'optional', prompt: '워드프레스 카테고리를 지정할 수 있습니다.', label: '워드프레스 카테고리', example: '선택' }
            },
            parameterSemantics: { saved_topic_row_number: { role: 'selection' } },
            outputDescription: '생성된 원고와 외부 블로그 전달 결과를 각각 반환합니다.',
            examples: ['OpenClaw 활용법 10선을 주제로 글을 써서 네이버 블로그에 임시저장해줘', '글감 저장소 #96을 사용해 네이버 블로그에 임시저장해줘']
        },
        validate: validateGenerateAndPublish,
        async preview(params = {}) {
            const validation = validateGenerateAndPublish(params);
            const resolved = await resolveGenerateInput(params);
            const normalized = { ...validation.normalizedParams, ...resolved.params };
            return {
                kind: 'manuscript_workflow',
                summary: `원고를 작성해 ${normalized.target === 'wordpress' ? '워드프레스' : '네이버 블로그'}에 ${normalized.postStatus === 'draft' ? '임시저장' : normalized.postStatus === 'schedule' ? '예약발행' : '게시'}합니다.${resolved.sourceTopic ? ` 글감 저장소 #${resolved.sourceTopic.rowNumber}의 설정을 활용합니다.` : ''}`,
                subject: normalized.subject,
                target: normalized.target,
                post_status: normalized.postStatus,
                keywords: normalized.keywords,
                image_mode: normalized.imageMode,
                external_reference: normalized.externalReference,
                naver_category: normalized.naverCategory,
                wordpress_category: normalized.wordpressCategory,
                ...(resolved.sourceTopic ? { source_topic: resolved.sourceTopic } : {})
            };
        },
        async execute(params = {}) {
            const validation = validateGenerateAndPublish(params);
            if (!validation.ok) throw new Error(validation.errors.join(' '));
            const normalized = validation.normalizedParams;
            const resolved = await resolveGenerateInput(params);
            const effectiveParams = { ...normalized, ...resolved.params };
            const generatedDraft = await generate(effectiveParams);
            let published;
            try {
                published = await publish({
                    draftId: generatedDraft.draftId,
                    revision: Number(generatedDraft.revision),
                    target: effectiveParams.target,
                    postStatus: effectiveParams.postStatus,
                    scheduleDate: effectiveParams.scheduleDate,
                    naverCategory: effectiveParams.naverCategory,
                    wordpressCategory: effectiveParams.wordpressCategory
                });
            } catch (error) {
                const apiError = error?.response?.data?.error;
                const reason = String(apiError?.message || error?.message || '대상 블로그가 요청을 거부했습니다.').slice(0, 500);
                const code = String(apiError?.code || error?.code || 'PUBLISH_FAILED').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
                const statusLabel = effectiveParams.postStatus === 'draft' ? '임시저장' : effectiveParams.postStatus === 'schedule' ? '예약발행' : '게시';
                Logger?.error?.(`[TelegramAgent][Manuscript] publish failed after draft saved target=${normalized.target} http_status=${Number(error?.response?.status) || 0} error_code=${code} message=${reason}`);
                return {
                    success: false,
                    message: `원고 생성은 완료했지만 ${effectiveParams.target === 'wordpress' ? '워드프레스' : '네이버 블로그'} ${statusLabel}에 실패했습니다. 생성된 원고는 BlogGenius 작업공간에 보관되어 있습니다 (원고 ID: ${generatedDraft.draftId}).${resolved.sourceTopic ? ` 글감 저장소 #${resolved.sourceTopic.rowNumber}의 설정을 활용했습니다.` : ''} 실패 사유: ${reason}`,
                    data: {
                        generation: { draftId: generatedDraft.draftId, revision: generatedDraft.revision, title: generatedDraft.title || generatedDraft.subject || '', ...(resolved.sourceTopic ? { sourceTopic: resolved.sourceTopic } : {}) },
                        publication: { success: false, code, message: reason }
                    },
                    sideEffects: ['manuscript_draft_created']
                };
            }
            const actualPostStatus = String(published.postStatus || published.results?.[effectiveParams.target]?.status || effectiveParams.postStatus);
            const actualStatusLabel = actualPostStatus === 'draft' ? '임시저장' : actualPostStatus === 'schedule' || actualPostStatus === 'future' ? '예약발행' : '게시';
            const forcedDraftNotice = published.publishPolicy?.forcedDraft === true
                ? ' 이미지가 준비되지 않아 임시저장으로 전환했습니다.'
                : '';
            return {
                success: published.success !== false,
                message: published.success === false
                    ? (published.message || '원고 생성은 완료했지만 블로그 발행에 실패했습니다. BlogGenius 원고 작업공간에서 생성된 원고를 확인할 수 있습니다.')
                    : `“${String(generatedDraft.title || generatedDraft.subject || effectiveParams.subject).trim()}” 원고를 작성해 ${effectiveParams.target === 'wordpress' ? '워드프레스' : '네이버 블로그'}에 ${actualStatusLabel}했습니다.${forcedDraftNotice}${resolved.sourceTopic ? ` 글감 저장소 #${resolved.sourceTopic.rowNumber}의 설정을 활용했습니다.` : ''}`,
                data: {
                    generation: { draftId: generatedDraft.draftId, revision: generatedDraft.revision, title: generatedDraft.title || generatedDraft.subject || '', ...(resolved.sourceTopic ? { sourceTopic: resolved.sourceTopic } : {}) },
                    publication: published
                },
                sideEffects: ['manuscript_draft_created', 'manuscript_published']
            };
        }
    };

    return [generationAction, publishAction, workflowAction];
}

module.exports = { createBlogManuscriptCapabilities, normalizeGenerateParams, normalizePublishParams };
