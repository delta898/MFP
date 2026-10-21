const NAVER_PUBLISH_STAGES = new Set([
    'editor', 'body', 'image', 'link', 'settings', 'submitting', 'verifying'
]);

function countLabel(progress = {}, unit) {
    const current = Number(progress.current);
    const total = Number(progress.total);
    if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1 || current < 1 || current > total) return '';
    return `${current}/${total}${unit}`;
}

function excerpt(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 65);
}

function presentNaverPublishProgress(progress = {}, fallbackPostStatus = 'publish') {
    const stage = String(progress.stage || '');
    if (!NAVER_PUBLISH_STAGES.has(stage)) return null;
    const postStatus = ['draft', 'publish', 'schedule'].includes(progress.postStatus)
        ? progress.postStatus : fallbackPostStatus;
    const action = postStatus === 'draft' ? '임시 저장'
        : postStatus === 'schedule' ? '예약 등록' : '발행';
    const label = excerpt(progress.label);
    const bodyTypeLabels = {
        heading: '소제목', paragraph: '본문', quote: '인용구', 'list-item': '목록'
    };
    const bodyType = bodyTypeLabels[progress.itemType] || '본문';
    const body = label ? `[${bodyType}] ${label} 입력 중` : `[${bodyType}] 입력 중`;
    const imageCount = countLabel(progress, '');
    const linkCount = countLabel(progress, '');
    const messages = {
        editor: '네이버 글쓰기 화면에 연결하고 있습니다.',
        body,
        image: `[이미지]${label ? ` ${label}` : ''} 업로드 중${imageCount ? ` (${imageCount})` : ''}`,
        link: `[연관글]${label ? ` ${label}` : ''} 링크 추가 중${linkCount ? ` (${linkCount})` : ''}`,
        settings: `${action} 설정을 적용하고 있습니다.`,
        submitting: `네이버 블로그에 ${action}을 요청하고 있습니다.`,
        verifying: `네이버 블로그의 ${action} 결과를 확인하고 있습니다.`
    };
    return { stage, postStatus, message: messages[stage] };
}

module.exports = { presentNaverPublishProgress };
