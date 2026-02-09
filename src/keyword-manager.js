const Utils = require('./utils');
const Logger = require('./logger');

const KeywordManager = {
    processKeywords: async function () {
        Logger.info("\n🚀 [Action] 연관검색어 및 블로그 참고 자료 수집 시작...");

        // 1. 대상 키워드 읽기
        const targets = await Utils.readGoogleSheetKeywords();
        if (targets.length === 0) {
            Logger.info("📭 처리할 키워드가 없습니다. ('연관검색어 조사 준비 완료' 상태 확인)");
            return;
        }

        Logger.info(`📂 총 ${targets.length}개의 키워드를 처리합니다.\n`);

        for (let i = 0; i < targets.length; i++) {
            const item = targets[i];
            const { rowIndex, keyword } = item;

            Logger.info(`---------------------------------------------------`);
            Logger.info(`[${i + 1}/${targets.length}] 키워드 처리 중: ${keyword}`);

            try {
                // 2. 상태 업데이트: 조사 중
                await Utils.updateGoogleSheetKeywordStatus(rowIndex, '연관검색어 조사 중');

                // 3. API 호출: 연관검색어 조회
                Logger.info(`   🔍 연관검색어 조회 중...`);
                const relatedKeywords = await Utils.fetchNaverRelatedKeywords(keyword);
                Logger.info(`   ✅ 연관검색어: ${relatedKeywords.length}개 발견`);

                // 4. 각 연관검색어별로 블로그 검색 및 데이터 생성
                const newTopics = [];
                Logger.info(`   🔍 각 연관검색어에 대한 블로그 참고 URL 수집 중...`);

                for (const relKw of relatedKeywords) {
                    try {
                        // 각 연관검색어(relKw)에 대해 블로그 검색 수행
                        const referenceUrl = await Utils.fetchNaverBlogSearchResults(relKw);

                        newTopics.push({
                            subject: keyword,     // 주제: 원본 키워드 (사용자 요청)
                            keywords: relKw,      // 키워드: 연관검색어
                            reference_urls: referenceUrl
                        });

                        // 네이버 API 레이트 리밋 고려 (약간의 딜레이)
                        await Utils.sleep(100);
                    } catch (err) {
                        Logger.warn(`   ⚠️ '${relKw}' 처리 중 오류: ${err.message}`);
                    }
                }

                Logger.info(`   ✅ 수집 완료: 총 ${newTopics.length}개의 토픽 생성`);

                // 5. 토픽 시트 추가 (일괄 추가)
                if (newTopics.length > 0) {
                    await Utils.appendGoogleSheetTopics(newTopics);
                }

                // 6. 상태 업데이트: 조사 완료
                await Utils.updateGoogleSheetKeywordStatus(rowIndex, '연관검색어 조사 완료');
                Logger.info(`   🎉 처리 완료`);

            } catch (e) {
                Logger.error(`   ❌ 처리 실패: ${e.message}`);
                await Utils.updateGoogleSheetKeywordStatus(rowIndex, '실패');
            }

            // API 속도 제한 고려하여 잠시 대기 (1초)
            if (i < targets.length - 1) await Utils.sleep(1000);
        }

        Logger.info(`\n✨ 모든 작업이 종료되었습니다.`);
    }
};

module.exports = KeywordManager;
