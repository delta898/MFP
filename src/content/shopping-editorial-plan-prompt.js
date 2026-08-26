function hashShoppingEditorialSeed(input) {
    const text = String(input || 'shopping').normalize('NFKC');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function hasShoppingValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    if (Array.isArray(value)) return value.length > 0;
    return String(value).trim().length > 0;
}

function selectShoppingEditorialPlan(product = {}) {
    const commerceData = product.commerceData || {};
    const reviewData = product.reviewData || {};
    const eligible = [];
    const hasConditions = [
        commerceData.salePrice,
        commerceData.originalPrice,
        commerceData.discountRate,
        commerceData.deliveryFee,
        commerceData.paymentBenefit,
        commerceData.pointBenefit
    ].some(hasShoppingValue);
    const hasReviewEvidence = hasShoppingValue(reviewData.facts) || hasShoppingValue(reviewData.reviewSamples);
    const hasUsageContext = hasShoppingValue(product.description) || hasShoppingValue(product.body);

    if (hasConditions) eligible.push('conditions_first');
    if (hasReviewEvidence) eligible.push('reaction_first');
    if (hasUsageContext) eligible.push('situation_first');
    eligible.push('decision_checklist', 'balanced_guide');

    const uniqueEligible = [...new Set(eligible)];
    const seed = [
        product.title,
        hasConditions ? 'conditions' : '',
        hasReviewEvidence ? 'reviews' : '',
        hasUsageContext ? 'usage' : ''
    ].join('|');
    return uniqueEligible[hashShoppingEditorialSeed(seed) % uniqueEligible.length];
}

function buildShoppingEditorialPlanPrompt(product = {}, options = {}) {
    const selectedPlan = selectShoppingEditorialPlan(product);
    const hasInstruction = Boolean(String(options.instruction || '').trim());
    const plans = {
        conditions_first: {
            label: '조건부터 판단하는 구성',
            intro: '가격·할인·배송 등 구매 조건에서 독자가 먼저 확인할 질문을 짚으세요.',
            flow: '핵심 조건 → 조건의 의미 → 적합한 사용 상황 → 사용자 반응 → 확인할 점 → 선택 정리'
        },
        reaction_first: {
            label: '사용자 반응에서 출발하는 구성',
            intro: '반복해서 확인되는 사용자 반응을 소개하되 공식 사실과 명확히 구분하세요.',
            flow: '사용자 반응 → 반응을 설명하는 공식 정보 → 적합한 상황 → 구매 조건 → 주의점 → 선택 정리'
        },
        situation_first: {
            label: '사용 상황에서 출발하는 구성',
            intro: '독자가 겪을 법한 선택 상황이나 용도를 조건형 문장으로 제시하세요.',
            flow: '사용 상황 → 관련 기능 → 기대할 수 있는 편의 → 구매 조건 → 사용자 반응 → 확인할 점'
        },
        decision_checklist: {
            label: '비교 체크리스트 구성',
            intro: '이 상품을 비교할 때 확인할 핵심 질문 두세 가지를 자연스럽게 제시하세요.',
            flow: '상품 식별 → 핵심 판단 기준 → 장점 → 조건과 제약 → 사용자 반응 → 최종 체크리스트'
        },
        balanced_guide: {
            label: '균형 잡힌 선택 가이드 구성',
            intro: '상품의 핵심 특징과 선택 전에 확인할 조건을 함께 예고하세요.',
            flow: '핵심 특징 → 유용한 상황 → 구매 조건 → 사용자 반응 → 장점과 확인점 → 선택 정리'
        }
    };
    const plan = plans[selectedPlan];

    return [
        '[이번 글의 편집 구성]',
        `- 선택 구성: ${plan.label}`,
        `- 도입 방향: ${plan.intro}`,
        `- 권장 흐름: ${plan.flow}`,
        '- 권장 흐름의 각 항목을 기계적으로 같은 이름의 소제목으로 쓰지 말고, 실제 데이터에 맞는 자연스러운 소제목으로 바꾸세요.',
        '- 근거가 없는 단계는 억지로 채우지 말고 인접 단계와 합치며, 전체 5~6개 블록 계약은 유지하세요.',
        '- 같은 가격·리뷰 수·혜택을 도입과 여러 블록에서 반복해 구성 차이를 숫자 반복으로 대신하지 마세요.',
        hasInstruction
            ? '- 사용자 참고/지시사항과 충돌하는 부분은 버리고 사용자 지시에 맞게 구성 순서와 관점을 조정하세요.'
            : '- 사용자 지시가 없으므로 직접 사용한 후기처럼 꾸미지 말고 조건형·근거형 서술을 유지하세요.'
    ].join('\n');
}

module.exports = {
    selectShoppingEditorialPlan,
    buildShoppingEditorialPlanPrompt
};
