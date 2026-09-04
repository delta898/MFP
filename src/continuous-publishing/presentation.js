const PROGRESS_PRESENTATIONS = Object.freeze({
    preparing: { title: '준비 중', message: '발행 설정과 연결 상태를 확인하고 있습니다.' },
    writing_naver: { title: '글 작성 중', message: '네이버 블로그용 글을 작성하고 있습니다.' },
    writing_wordpress: { title: '글 작성 중', message: '워드프레스용 글을 작성하고 있습니다.' },
    images_naver: { title: '이미지 준비 중', message: '네이버 블로그용 이미지를 준비하고 있습니다.' },
    images_wordpress: { title: '이미지 준비 중', message: '워드프레스용 이미지를 준비하고 있습니다.' },
    quota: { title: '발행 준비 중', message: '이용 가능 횟수를 확인하고 있습니다.' },
    finalizing: { title: '마무리 중', message: '완료 결과를 정리하고 있습니다.' }
});

function normalizePostStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['publish', 'draft', 'schedule'].includes(normalized) ? normalized : 'publish';
}

function getPostingAction(postStatus) {
    const normalized = normalizePostStatus(postStatus);
    if (normalized === 'draft') return '임시 저장';
    if (normalized === 'schedule') return '예약 등록';
    return '공개 발행';
}

function presentPublishingProgress(rawMessage, options = {}) {
    const message = String(rawMessage || '').trim();
    const postStatus = normalizePostStatus(options.postStatus);
    const action = getPostingAction(postStatus);
    if (/네이버 콘텐츠 생성/.test(message)) return { stage: 'writing', ...PROGRESS_PRESENTATIONS.writing_naver };
    if (/워드프레스 콘텐츠 생성/.test(message)) return { stage: 'writing', ...PROGRESS_PRESENTATIONS.writing_wordpress };
    if (/네이버 이미지 준비/.test(message)) return { stage: 'images', ...PROGRESS_PRESENTATIONS.images_naver };
    if (/워드프레스 이미지 준비/.test(message)) return { stage: 'images', ...PROGRESS_PRESENTATIONS.images_wordpress };
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
    return links;
}

module.exports = {
    normalizePostStatus,
    presentPublishingProgress,
    buildCompletionLinks
};
