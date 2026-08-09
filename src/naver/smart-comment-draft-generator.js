const TONE_LABELS = {
    empathetic: '공감형',
    friendly: '친근형',
    calm: '담백형'
};
const SMART_COMMENT_PROMPT_VERSION = '2026-08-10-v1';

function stripCodeFence(raw) {
    return String(raw || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function extractFirstJsonObject(raw) {
    const text = stripCodeFence(raw);
    const start = text.indexOf('{');
    if (start < 0) return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, index + 1);
        }
    }
    return '';
}

function sanitizeDraftText(raw, maxChars) {
    const text = String(raw || '')
        .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text || text.length > maxChars) return '';
    return text;
}

function parseDraftResponse(raw, maxChars) {
    let parsed;
    try {
        const jsonText = extractFirstJsonObject(raw);
        if (!jsonText) throw new Error('JSON object not found');
        parsed = JSON.parse(jsonText);
    } catch (_error) {
        return { drafts: [], errors: ['응답이 올바른 JSON 형식이 아닙니다.'] };
    }

    if (!parsed || !Array.isArray(parsed.drafts)) {
        return { drafts: [], errors: ['drafts 배열이 없습니다.'] };
    }

    const drafts = parsed.drafts.map((draft) => sanitizeDraftText(draft, maxChars));
    const errors = [];
    if (drafts.length !== 3) errors.push('댓글 초안은 정확히 3개여야 합니다.');
    if (drafts.some((draft) => !draft)) errors.push(`모든 댓글은 비어 있지 않고 ${maxChars}자 이하여야 합니다.`);

    return { drafts: drafts.filter(Boolean), errors };
}

function normalizeForDuplicateCheck(text) {
    return String(text || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
}

function validateDrafts(drafts, maxChars) {
    const errors = [];
    if (!Array.isArray(drafts) || drafts.length !== 3) {
        return ['댓글 초안은 정확히 3개여야 합니다.'];
    }

    drafts.forEach((draft, index) => {
        const value = String(draft || '').trim();
        const hangulCount = (value.match(/[가-힣]/g) || []).length;
        const latinCount = (value.match(/[A-Za-z]/g) || []).length;
        if (value.length < 12) errors.push(`${index + 1}번 댓글이 너무 짧습니다.`);
        if (value.length > maxChars) errors.push(`${index + 1}번 댓글이 최대 글자수를 넘었습니다.`);
        if (hangulCount < 6) errors.push(`${index + 1}번 댓글에 자연스러운 한국어가 부족합니다.`);
        if (latinCount > Math.max(4, Math.floor(hangulCount * 0.25))) {
            errors.push(`${index + 1}번 댓글에 불필요한 영어가 많습니다.`);
        }
        if (/^(no|yes|fine|ok|okay)[\s.!?)]*$/i.test(value)) {
            errors.push(`${index + 1}번 댓글이 불완전한 단답형입니다.`);
        }
        if (!/[.!?~요죠네군데까나다함음임]$/.test(value)) {
            errors.push(`${index + 1}번 댓글이 자연스럽게 끝나지 않습니다.`);
        }
    });

    const unique = new Set(drafts.map(normalizeForDuplicateCheck));
    if (unique.size !== drafts.length) errors.push('댓글 초안끼리 내용이 중복됩니다.');
    return [...new Set(errors)];
}

function buildCommentDraftPrompt({ authorName = '', title = '', excerpt = '', tone = 'empathetic', maxChars = 60, feedback = [] }) {
    const excerptText = String(excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const lines = [
        `프롬프트 버전: ${SMART_COMMENT_PROMPT_VERSION}`,
        '당신은 네이버 블로그 이웃새글 카드의 제목과 공개된 본문 일부를 보고 자연스러운 한국어 댓글 초안을 만드는 도우미입니다.',
        `댓글 톤: ${TONE_LABELS[tone] || TONE_LABELS.empathetic}`,
        `최대 글자수: ${maxChars}자`,
        '조건:',
        '- 제목이나 본문 일부에 실제로 나온 구체적인 주제 또는 세부 내용을 언급한다.',
        '- 보이지 않은 내용을 읽었다고 가정하거나 방문, 구매, 사용 경험을 지어내지 않는다.',
        '- 한국어 존댓말로 된 완결된 댓글을 정확히 3개 만든다.',
        '- 단순 감탄이나 어디에나 붙일 수 있는 상투적인 문장만 쓰지 않는다.',
        '- 초안 3개는 관점과 표현을 서로 다르게 한다.',
        '- 한자, 일본어, 중국어, 불필요한 영어를 섞지 않는다. 고유명사는 예외로 한다.',
        '- 반말, 과장, 홍보성 표현, 자동화 티가 나는 표현을 쓰지 않는다.',
        '- 각 초안은 1~2문장이고 문장 중간에서 끊지 않는다.',
        `- 각 초안은 공백을 포함해 ${maxChars}자 이내다.`,
        '- 반드시 {"drafts":["...","...","..."]} 형태의 JSON만 반환한다.',
        '- JSON 앞뒤에 설명, 주석, 코드 블록을 붙이지 않는다.'
    ];

    if (feedback.length > 0) {
        lines.push('', '이전 응답의 문제를 모두 수정해 전체 초안 3개를 다시 작성한다:');
        feedback.forEach((message) => lines.push(`- ${message}`));
    }

    lines.push('', `작성자: ${authorName || '알 수 없음'}`, `제목: ${title}`, `공개된 본문 일부: ${excerptText}`);
    return lines.join('\n');
}

async function generateSmartCommentDrafts(options = {}) {
    const {
        callModel,
        aiMode,
        authorName,
        title,
        excerpt,
        maxChars = 60,
        tone = 'empathetic',
        logger
    } = options;
    if (typeof callModel !== 'function') throw new Error('댓글 초안 생성 모델 호출기가 없습니다.');

    let feedback = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = buildCommentDraftPrompt({ authorName, title, excerpt, tone, maxChars, feedback });
        const raw = await callModel(aiMode, prompt);
        const parsed = parseDraftResponse(raw, maxChars);
        const errors = parsed.errors.length > 0
            ? parsed.errors
            : validateDrafts(parsed.drafts, maxChars);
        if (errors.length === 0) return parsed.drafts;

        feedback = [...new Set(errors)];
        logger?.debug?.(`⚠️ [NaverCommentDraft] 초안 품질 검증 실패 (${attempt + 1}/2): ${feedback.join(' / ')}`);
    }

    const error = new Error(`댓글 초안 품질 기준을 충족하지 못했습니다: ${feedback.join(' ')}`);
    error.code = 'COMMENT_DRAFT_QUALITY_FAILED';
    throw error;
}

module.exports = {
    SMART_COMMENT_PROMPT_VERSION,
    buildCommentDraftPrompt,
    extractFirstJsonObject,
    generateSmartCommentDrafts,
    parseDraftResponse,
    sanitizeDraftText,
    validateDrafts
};
