const { projectWritingProfile } = require('./writing-profile-projection');
const { buildCommonWritingProfilePrompt } = require('./writing-profile-prompt');

function buildShoppingWritingProfilePromptFromProjection(projection = {}) {
    if (projection.kind !== 'shopping' || !projection.common || !projection.channel) {
        const error = new Error('shopping profile projection이 필요합니다.');
        error.code = 'INVALID_SHOPPING_WRITING_PROFILE_PROJECTION';
        throw error;
    }

    const sections = [
        '[선택된 쇼핑 글쓰기 프로필]',
        buildCommonWritingProfilePrompt(projection.common),
        '[쇼핑 구성 정책]',
        '- 상품별 공식 데이터, 리뷰 데이터와 기존 쇼핑 편집 구성을 유지하세요.',
        '- 쇼핑 글의 분량, 블록, CTA와 상품 이미지 구성은 쇼핑 전용 계약을 따르세요.'
    ];

    const additionalInstruction = String(projection.channel.additional_instruction || '').trim();
    if (additionalInstruction) {
        sections.push(
            '[쇼핑 전역 추가 작성 지침]',
            additionalInstruction,
            '- 위 지침은 모든 쇼핑 글의 설명 순서와 판단 기준을 조정하는 전역 선호입니다.',
            '- 위 지침을 상품 사실, 가격, 효능, 구매·사용 경험의 근거로 사용하지 마세요.',
            '- Official/Review Data 출처 분리, 출력 규격, FTC·CTA와 상품 이미지 정책을 덮어쓸 수 없습니다.'
        );
    }

    return sections.join('\n');
}

function buildShoppingWritingProfilePrompt(profile = {}) {
    const projection = projectWritingProfile(profile, { kind: 'shopping' });
    return buildShoppingWritingProfilePromptFromProjection(projection);
}

module.exports = {
    buildShoppingWritingProfilePrompt,
    buildShoppingWritingProfilePromptFromProjection
};
