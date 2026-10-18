const Logger = require('../../utilities/logging/logger');

/**
 * Derives a concise user insight from recent Agent conversation history.
 * Persistence and text generation are supplied by the runtime that owns them.
 */
async function generateUserInsight(chatId, dependencies = {}) {
    const eventStore = dependencies.eventStore;
    const generateText = dependencies.generateText;
    const logger = dependencies.logger || Logger;

    try {
        logger.info(`🔍 [MemoryInsight] 사용자(${chatId}) 인사이트 분석 시작...`);

        if (!eventStore || typeof eventStore.getHistory !== 'function' || typeof eventStore.updateUserInsight !== 'function') {
            throw new Error('Memory insight persistence is unavailable.');
        }

        const history = await eventStore.getHistory(chatId, 20);
        if (!history || history.length < 3) {
            logger.info('ℹ️ [MemoryInsight] 데이터가 부족하여 분석을 건너뜁니다. (최소 3개 필요)');
            return null;
        }

        if (typeof generateText !== 'function') {
            throw new Error('AI Gateway text generation is unavailable.');
        }

        const historyText = [...history].reverse().map((item) => `[${item.intent}] ${item.text}`).join('\n');
        const prompt = `당신은 블로그 자동화 시스템의 전략 분석가입니다.
아래 사용자 대화 기록을 분석하여 이 사용자의 성향, 자주 쓰는 카테고리, 말투, 선호 플랫폼 등을 한 문장으로 요약해 주세요.
이 정보는 나중에 사용자의 요청을 더 지능적으로 이해하는 데 사용됩니다.

[대화 기록]
${historyText}

[출력 형식]
반드시 한 문장의 한국어로 응답하세요. 예: "테크 관련 최신 트렌드에 관심이 많으며 네이버 블로그에 정보성 글을 주로 발행하는 성향임."`;

        const summary = await generateText(prompt, { maxTokens: 512, temperature: 0.3 });
        if (!summary) return null;

        logger.info('✨ [MemoryInsight] 신규 인사이트 도출 완료');
        await eventStore.updateUserInsight(chatId, summary);
        return summary;
    } catch (error) {
        logger.error(`❌ [MemoryInsight] 인사이트 생성 중 오류: ${error.message}`);
        return null;
    }
}

module.exports = { generateUserInsight };
