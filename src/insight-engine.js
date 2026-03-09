const KuzuService = require('./kuzu-service');
const Logger = require('./logger');

class InsightEngine {
    /**
     * 특정 사용자의 대화 기록을 분석하여 인사이트를 생성하고 저장합니다.
     */
    async generateInsight(chatId) {
        try {
            Logger.info(`🔍 [InsightEngine] 사용자(${chatId}) 인사이트 분석 시작...`);

            // 1. 히스토리 로드 (최근 20개 정도)
            const history = await KuzuService.getHistory(chatId, 20);
            if (!history || history.length < 3) {
                Logger.info(`ℹ️ [InsightEngine] 데이터가 부족하여 분석을 건너뜁니다. (최소 3개 필요)`);
                return null;
            }

            // 2. AI 분석 요청
            const Core = require('./core');
            const historyText = history.reverse().map(h => `[${h.intent}] ${h.text}`).join('\n');

            const prompt = `당신은 블로그 자동화 시스템의 전략 분석가입니다. 
아래 사용자 대화 기록을 분석하여 이 사용자의 성향, 자주 쓰는 카테고리, 말투, 선호 플랫폼 등을 한 문장으로 요약해 주세요.
이 정보는 나중에 사용자의 요청을 더 지능적으로 이해하는 데 사용됩니다.

[대화 기록]
${historyText}

[출력 형식]
반드시 한 문장의 한국어로 응답하세요. 예: "테크 관련 최신 트렌드에 관심이 많으며 네이버 블로그에 정보성 글을 주로 발행하는 성향임."`;

            // Core.generateAIText 또는 유사한 기능을 사용 (여기서는 직접 Gemini 호출 기능이 Core에 있다고 가정)
            // parseTelegramRequest 내부에서 사용하는 AI 호출 로직을 재활용하거나 간단한 래퍼를 사용
            const summary = await Core.generateSimpleInsight(prompt);

            if (summary) {
                Logger.info(`✨ [InsightEngine] 신규 인사이트 도출: ${summary}`);
                await KuzuService.updateUserInsight(chatId, summary);
                return summary;
            }
        } catch (err) {
            Logger.error(`❌ [InsightEngine] 인사이트 생성 중 오류: ${err.message}`);
        }
        return null;
    }
}

module.exports = new InsightEngine();
