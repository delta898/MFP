const KuzuService = require('../src/kuzu-service');
const Logger = require('../src/logger');
const path = require('path');

async function debugTopicRegistration() {
    Logger.info("🔍 [Debug] TopicNode 등록 재현 테스트 시작");

    await KuzuService.initialize();

    const chatId = "DEBUG_USER_123";
    const topicData = {
        subject: "아이폰 17e 성능 테스트",
        platform: "naver",
        category: "테크",
        keywords: "아이폰, 성능",
        instruction: "상세하게 적어줘",
        source: "telegram"
    };

    try {
        Logger.info("📤 KuzuService.recordTopic 호출 중...");
        const topicId = await KuzuService.recordTopic(chatId, topicData);
        Logger.info(`✅ Topic 등록 성공! ID: ${topicId}`);

        // 검증: 직접 쿼리로 조회
        Logger.info("🔎 DB 직접 조회 중...");
        const res = await KuzuService._runQuery("MATCH (u:UserNode {id: $chatId})-[:UserREQUESTS]->(t:TopicNode) RETURN t.*, u.id", { chatId: String(chatId) });

        let found = false;
        while (res.hasNext()) {
            const row = await res.getNext();
            console.log("Found Row:", JSON.stringify(row, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
            found = true;
        }

        if (!found) {
            Logger.error("❌ DB에서 해당 관계를 찾을 수 없습니다! (User -> Topic 관계 생성 실패 가능성)");

            // 관계 없이 노드만 있는지 확인
            const nodeRes = await KuzuService._runQuery("MATCH (t:TopicNode {subject: $subject}) RETURN t.*", { subject: topicData.subject });
            if (nodeRes.hasNext()) {
                Logger.info("⚠️ 노드는 존재하지만 관계가 없습니다.");
            } else {
                Logger.error("❌ 노드조차 존재하지 않습니다.");
            }
        } else {
            Logger.info("✅ 모든 검증 완료 (성공)");
        }

    } catch (err) {
        Logger.error(`❌ 에러 발생: ${err.message}`);
        console.error(err);
    }

    await KuzuService.close();
}

debugTopicRegistration();
