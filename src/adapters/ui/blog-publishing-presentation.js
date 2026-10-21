const { presentNaverPublishProgress } = require('./naver-publish-progress');

const PROGRESS_PRESENTATIONS = Object.freeze({
    preparing: { title: '준비 중', message: '포스팅 설정과 연결 상태를 확인하고 있습니다.' },
    writing_naver: { title: '글 작성 중', message: '네이버 블로그용 글을 작성하고 있습니다.' },
    writing_wordpress: { title: '글 작성 중', message: '워드프레스용 글을 작성하고 있습니다.' },
    images_naver: { title: '이미지 준비 중', message: '네이버 블로그용 이미지를 준비하고 있습니다.' },
    images_wordpress: { title: '이미지 준비 중', message: '워드프레스용 이미지를 준비하고 있습니다.' },
    quota: { title: '포스팅 준비 중', message: '이용 가능 횟수를 확인하고 있습니다.' },
    finalizing: { title: '마무리 중', message: '완료 결과를 정리하고 있습니다.' }
});

const NAVER_PROGRESS_TITLES = Object.freeze({
    editor: '포스팅 준비 중',
    body: '본문 입력 중',
    image: '이미지 업로드 중',
    link: '연관글 추가 중',
    settings: '발행 설정 적용 중',
    submitting: '발행 요청 중',
    verifying: '발행 결과 확인 중'
});

function normalizePostStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['publish', 'draft', 'schedule'].includes(normalized) ? normalized : 'publish';
}

function getPostingAction(postStatus) {
    const normalized = normalizePostStatus(postStatus);
    if (normalized === 'draft') return '임시 저장';
    if (normalized === 'schedule') return '예약 발행';
    return '포스팅';
}

function presentPublishingProgress(rawMessage, options = {}) {
    const message = String(rawMessage || '').trim();
    const postStatus = normalizePostStatus(options.postStatus);
    const action = getPostingAction(postStatus);
    const naverProgressMatches = [
        ['editor', /네이버 글쓰기 화면에 연결하고 있습니다\./],
        ['body', /\[(소제목|본문|인용구|목록)\](?: (.+?))? 입력 중/],
        ['image', /\[이미지\](?: (.+?))? 업로드 중(?: \((\d+)\/(\d+)\))?/],
        ['link', /\[연관글\](?: (.+?))? 링크 추가 중(?: \((\d+)\/(\d+)\))?/],
        ['body_legacy', /본문을 입력하고 있습니다\.(?: \((\d+)\/(\d+)\))?/],
        ['image_legacy', /이미지를 업로드하고 있습니다\.(?: \((\d+)\/(\d+)\))?/],
        ['link_legacy', /관련 링크를 추가하고 있습니다\.(?: \((\d+)\/(\d+)\))?/],
        ['settings', /(?:발행|임시 저장|예약 등록) 설정을 적용하고 있습니다\./],
        ['submitting', /네이버 블로그에 (?:발행|임시 저장|예약 등록)을 요청하고 있습니다\./],
        ['verifying', /네이버 블로그의 (?:발행|임시 저장|예약 등록) 결과를 확인하고 있습니다\./]
    ];
    for (const [stage, pattern] of naverProgressMatches) {
        const match = message.match(pattern);
        if (!match) continue;
        const legacy = stage.endsWith('_legacy');
        const normalizedStage = legacy ? stage.replace('_legacy', '') : stage;
        const progress = presentNaverPublishProgress({
            stage: normalizedStage,
            ...(normalizedStage === 'body' ? {
                itemType: legacy ? 'paragraph' : ({ '소제목': 'heading', '본문': 'paragraph', '인용구': 'quote', '목록': 'list-item' })[match[1]],
                ...(legacy ? {} : { label: match[2] || '' })
            } : {}),
            ...(normalizedStage !== 'body' && !legacy && match[1] ? { label: match[1] } : {}),
            ...(legacy && match[1] && match[2] ? { current: Number(match[1]), total: Number(match[2]) } : {}),
            ...(!legacy && normalizedStage !== 'body' && match[2] && match[3] ? { current: Number(match[2]), total: Number(match[3]) } : {}),
            postStatus
        }, postStatus);
        if (progress) return { stage: progress.stage, title: NAVER_PROGRESS_TITLES[normalizedStage], message: progress.message };
    }
    if (/네이버 콘텐츠 생성/.test(message)) return { stage: 'writing', ...PROGRESS_PRESENTATIONS.writing_naver };
    if (/워드프레스 콘텐츠 생성/.test(message)) return { stage: 'writing', ...PROGRESS_PRESENTATIONS.writing_wordpress };
    if (/네이버 이미지 준비/.test(message)) return { stage: 'images', ...PROGRESS_PRESENTATIONS.images_naver };
    if (/워드프레스 이미지 준비/.test(message)) return { stage: 'images', ...PROGRESS_PRESENTATIONS.images_wordpress };
    if (/이미지 (생성 중|준비 완료|생성 실패)/.test(message)) {
        return { stage: 'images', title: '이미지 준비 중', message };
    }
    if (/라이선스 사용량 예약/.test(message)) return { stage: 'quota', ...PROGRESS_PRESENTATIONS.quota };
    if (/네이버 발행 중/.test(message)) {
        return { stage: 'publishing', title: `${action} 중`, message: `네이버 블로그에 ${action}하고 있습니다.` };
    }
    if (/워드프레스 발행 중/.test(message)) {
        return { stage: 'publishing', title: `${action} 중`, message: `워드프레스에 ${action}하고 있습니다.` };
    }
    if (/네이버 .*완료/.test(message)) {
        return { stage: 'finalizing', title: '마무리 중', message: `네이버 블로그 ${action}을 완료하고 결과를 정리하고 있습니다.` };
    }
    if (/워드프레스 .*완료/.test(message)) {
        return { stage: 'finalizing', title: '마무리 중', message: `워드프레스 ${action}을 완료하고 결과를 정리하고 있습니다.` };
    }
    if (/시트 상태 반영|완료$/.test(message)) return { stage: 'finalizing', ...PROGRESS_PRESENTATIONS.finalizing };
    if (/사전 검증|발행 처리 시작/.test(message)) return { stage: 'preparing', ...PROGRESS_PRESENTATIONS.preparing };
    return { stage: 'running', title: '처리 중', message: message || '포스팅을 처리하고 있습니다.' };
}

function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch (_error) {
        return '';
    }
}

function buildCompletionLinks({ postStatus, results, config } = {}) {
    const normalizedStatus = normalizePostStatus(postStatus);
    if (normalizedStatus === 'schedule') return [];
    const source = results && typeof results === 'object' ? results : {};
    const runtimeConfig = config && typeof config === 'object' ? config : {};
    const links = [];
    for (const platform of ['naver', 'wordpress']) {
        if (source[platform]?.success !== true) continue;
        let url = '';
        let label = '';
        if (normalizedStatus === 'draft') {
            url = platform === 'naver'
                ? safeHttpUrl(runtimeConfig.NAVER_ID ? `https://blog.naver.com/${encodeURIComponent(String(runtimeConfig.NAVER_ID).trim())}` : '')
                : safeHttpUrl(runtimeConfig.WORDPRESS_URL);
            label = platform === 'naver' ? '네이버 블로그 열기' : '워드프레스 열기';
        } else {
            url = safeHttpUrl(source[platform]?.postUrl);
            label = platform === 'naver' ? '네이버 글 보기' : '워드프레스 글 보기';
        }
        if (url) links.push({ platform, kind: normalizedStatus === 'draft' ? 'home' : 'post', label, url });
    }
    if (normalizedStatus === 'publish' && source['site-hosting']?.success === true) {
        const url = safeHttpUrl(source['site-hosting']?.postUrl);
        if (url) links.push({ platform: 'site-hosting', kind: 'post', label: '사이트 글 보기', url });
    }
    return links;
}

module.exports = {
    normalizePostStatus,
    presentPublishingProgress,
    buildCompletionLinks
};
