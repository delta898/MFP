const { createOperationalCandidate, createSystemStateEvidence } = require('./operational-candidate');

const SETUP_GUIDANCE_PRODUCER_ID = 'setup-guidance-v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function createSetupGuidanceProducer() {
    return {
        id: SETUP_GUIDANCE_PRODUCER_ID,
        version: 1,
        kinds: ['setup_guidance'],
        async produce(input = {}, context = {}) {
            const state = input.operational_state || context.operational_state || {};
            const ownerUserId = String(input.owner_user_id || context.owner_user_id || '').trim();
            if (!ownerUserId || state.owner_user_id !== ownerUserId || !state.readiness) return { candidates: [] };
            const observedAt = state.observed_at;
            const readiness = state.readiness;
            const candidates = [];

            function append(definition) {
                const evidence = createSystemStateEvidence({
                    observed_at: observedAt,
                    ttl_ms: WEEK_MS,
                    source_id: definition.sourceId,
                    label: definition.label,
                    summary: definition.explanation,
                    features: { configured: false }
                });
                candidates.push(createOperationalCandidate({
                    producer_id: SETUP_GUIDANCE_PRODUCER_ID,
                    owner_user_id: ownerUserId,
                    kind: 'setup_guidance',
                    key: definition.sourceId,
                    title: definition.title,
                    summary: definition.summary,
                    explanation: definition.explanation,
                    evidence: [evidence],
                    handoff: {
                        type: 'presentation',
                        label: definition.actionLabel,
                        target: { surface: definition.surface, view: 'settings', tab: definition.tab },
                        payload: { section: definition.section }
                    },
                    created_at: observedAt,
                    ttl_ms: WEEK_MS,
                    metadata: { setup_area: definition.section }
                }));
            }

            if (readiness.config_ready !== true) {
                append({
                    sourceId: 'config:runtime', label: '앱 설정 상태', section: 'general',
                    title: '앱 기본 설정을 확인해보세요', summary: '저장된 앱 설정이 아직 준비되지 않았습니다.',
                    explanation: '현재 런타임에서 기본 설정 준비가 완료되지 않은 상태입니다.',
                    actionLabel: '일반 설정 보기', surface: 'settings.general', tab: 'general'
                });
                return { candidates };
            }

            if (readiness.google_sheets_configured !== true) {
                append({
                    sourceId: 'config:google-sheets', label: 'Google Sheets 설정', section: 'google-sheets',
                    title: 'Google Sheets를 연결해보세요', summary: '글감 저장과 발행 작업에 사용할 Google Sheets가 설정되지 않았습니다.',
                    explanation: '현재 설정에서 Google Sheets 연결 정보가 확인되지 않았습니다.',
                    actionLabel: '일반 설정 보기', surface: 'settings.general', tab: 'general'
                });
            }
            if (readiness.naver_blog_configured !== true && readiness.wordpress_configured !== true) {
                append({
                    sourceId: 'config:publishing-platform', label: '블로그 발행 채널 설정', section: 'blog',
                    title: '블로그 발행 채널을 설정해보세요', summary: 'Naver Blog와 WordPress 발행 채널이 모두 설정되지 않았습니다.',
                    explanation: '현재 설정에서 사용할 수 있는 블로그 발행 채널이 확인되지 않았습니다.',
                    actionLabel: '블로그 설정 보기', surface: 'settings.blog', tab: 'naver-blog'
                });
            } else if (readiness.naver_blog_configured === true && readiness.wordpress_configured !== true) {
                append({
                    sourceId: 'config:wordpress', label: 'WordPress 설정', section: 'wordpress',
                    title: 'WordPress 발행 채널도 연결해보세요',
                    summary: '현재 Naver Blog만 설정되어 있습니다. 필요하다면 WordPress를 추가할 수 있습니다.',
                    explanation: '현재 설정에서 Naver Blog는 준비됐지만 WordPress 연결은 확인되지 않았습니다.',
                    actionLabel: 'WordPress 설정 보기', surface: 'settings.wordpress', tab: 'naver-blog'
                });
            }
            return { candidates: candidates.slice(0, 3) };
        }
    };
}

module.exports = {
    SETUP_GUIDANCE_PRODUCER_ID,
    createSetupGuidanceProducer
};
