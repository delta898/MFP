const kuzu = require('kuzu');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

class KuzuService {
    constructor() {
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.initPromise = null;
        this.dbPath = path.join(process.cwd(), 'data', 'memory_db');
    }

    async initialize() {
        if (this.isInitialized) return;
        if (this.isInitializing) return this.initPromise;

        this.isInitializing = true;
        this.initPromise = (async () => {
            try {
                // Ensure data directory exists
                const dataDir = path.join(process.cwd(), 'data');
                if (!fs.existsSync(dataDir)) {
                    fs.mkdirSync(dataDir);
                }

                Logger.info(`📂 [Kuzu] 데이터베이스 초기화 중: ${this.dbPath}`);

                // If the path exists but is not a directory, remove it (safety against old file-based DBs)
                if (fs.existsSync(this.dbPath) && !fs.lstatSync(this.dbPath).isDirectory()) {
                    Logger.warn(`⚠️ [Kuzu] 보관된 파일형 DB 발견. 디렉토리 기반으로 교체합니다.`);
                    fs.unlinkSync(this.dbPath);
                }

                this.db = new kuzu.Database(this.dbPath);
                this.conn = new kuzu.Connection(this.db);

                await this._createSchema();

                this.isInitialized = true;
                Logger.info('✅ [Kuzu] 데이터베이스 서비스가 준비되었습니다.');
            } catch (err) {
                Logger.error(`❌ [Kuzu] 초기화 실패: ${err.message}`);
                this.isInitializing = false;
                this.initPromise = null;
                throw err;
            } finally {
                this.isInitializing = false;
            }
        })();

        return this.initPromise;
    }

    async _createSchema() {
        const ddlQueries = [
            "CREATE NODE TABLE UserNode(id STRING, username STRING, PRIMARY KEY (id))",
            "CREATE NODE TABLE MessageNode(id SERIAL, text STRING, timestamp TIMESTAMP, intent STRING, sender STRING, PRIMARY KEY (id))",
            "CREATE NODE TABLE TopicNode(id SERIAL, subject STRING, platform STRING, category STRING, keywords STRING, instruction STRING, source STRING, timestamp TIMESTAMP, PRIMARY KEY (id))",
            "CREATE NODE TABLE ShoppingNode(id SERIAL, name STRING, price STRING, mall STRING, source STRING, timestamp TIMESTAMP, PRIMARY KEY (id))",
            "CREATE NODE TABLE InsightNode(id SERIAL, summary STRING, updatedAt TIMESTAMP, PRIMARY KEY (id))",
            "CREATE REL TABLE UserSAYS(FROM UserNode TO MessageNode)",
            "CREATE REL TABLE UserREQUESTS(FROM UserNode TO TopicNode)",
            "CREATE REL TABLE UserSHOPPING(FROM UserNode TO ShoppingNode)",
            "CREATE REL TABLE MsgMAPPED_TO(FROM MessageNode TO TopicNode)",
            "CREATE REL TABLE UserHAS_INSIGHT(FROM UserNode TO InsightNode)"
        ];

        for (const query of ddlQueries) {
            try {
                Logger.debug(`[Kuzu Schema] Executing: ${query}`);
                await this.conn.query(query);
                // Give Kuzu a tiny bit of breathing room between DDLs
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                if (!err.message.includes('already exists')) {
                    Logger.error(`⚠️ [Kuzu Schema] '${query}' 실패: ${err.message}`);
                }
            }
        }
    }

    async _runQuery(query, params = {}) {
        if (!this.conn) await this.initialize();

        try {
            if (Object.keys(params).length === 0) {
                // Simple query (e.g. DDL)
                return await this.conn.query(query);
            } else {
                // Parameterized query
                const preparedStatement = await this.conn.prepare(query);
                return await this.conn.execute(preparedStatement, params);
            }
        } catch (err) {
            Logger.debug(`[Kuzu] Query Error: ${err.message} | Query: ${query}`);
            throw err;
        }
    }

    async ensureUser(chatId, username = 'Unknown') {
        const query = `
            MERGE (u:UserNode {id: $id})
            ON CREATE SET u.username = $username
            ON MATCH SET u.username = $username
        `;
        await this._runQuery(query, { id: String(chatId), username });
    }

    /**
     * 메시지 기록
     */
    async recordMessage(chatId, text, intent = 'UNKNOWN', sender = 'USER') {
        await this.ensureUser(chatId);
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

        // 1. 메시지 노드 생성
        const createMsgQuery = `
            CREATE (m:MessageNode {text: $text, timestamp: CAST($timestamp AS TIMESTAMP), intent: $intent, sender: $sender})
            RETURN m.id AS msgId
        `;
        const res = await this._runQuery(createMsgQuery, { text, timestamp, intent, sender });
        const results = [];
        while (res.hasNext()) {
            results.push(await res.getNext());
        }
        if (results.length === 0) throw new Error("Message creation failed - no result");
        const resultObj = results[0];
        const msgId = resultObj.msgId !== undefined ? resultObj.msgId : (resultObj['m.id'] !== undefined ? resultObj['m.id'] : resultObj[Object.keys(resultObj)[0]]);

        // 2. 사용자와 관계 연결
        const linkQuery = `
            MATCH (u:UserNode {id: $userId}), (m:MessageNode)
            WHERE m.id = $msgId
            CREATE (u)-[:UserSAYS]->(m)
        `;
        await this._runQuery(linkQuery, { userId: String(chatId), msgId });

        return msgId;
    }

    /**
     * 성공한 토픽 등록 기록
     */
    async recordTopic(chatId, topicData) {
        const userId = String(chatId || 'SYSTEM');
        await this.ensureUser(userId);
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

        // 1. 토픽 노드 생성
        const createTopicQuery = `
            CREATE (t:TopicNode {
                subject: $subject, 
                platform: $platform, 
                category: $category, 
                keywords: $keywords,
                instruction: $instruction,
                source: $source,
                timestamp: CAST($timestamp AS TIMESTAMP)
            })
            RETURN t.id AS topicId
        `;
        const res = await this._runQuery(createTopicQuery, {
            subject: topicData.subject || '',
            platform: topicData.platform || '',
            category: topicData.category || '',
            keywords: topicData.keywords || '',
            instruction: topicData.instruction || '',
            source: topicData.source || 'manual',
            timestamp
        });
        const results = [];
        while (res.hasNext()) {
            results.push(await res.getNext());
        }
        if (results.length === 0) throw new Error("Topic creation failed - no result");
        const resultObj = results[0];
        const topicId = resultObj.topicId !== undefined ? resultObj.topicId : (resultObj['t.id'] !== undefined ? resultObj['t.id'] : resultObj[Object.keys(resultObj)[0]]);

        // 2. 사용자와 관계 연결
        const linkQuery = `
            MATCH (u:UserNode {id: $userId}), (t:TopicNode)
            WHERE t.id = $topicId
            CREATE (u)-[:UserREQUESTS]->(t)
        `;
        await this._runQuery(linkQuery, { userId, topicId });

        return topicId;
    }

    /**
     * 쇼핑 아이템 등록 기록
     */
    async recordShoppingItem(chatId, itemData) {
        const userId = String(chatId || 'SYSTEM');
        await this.ensureUser(userId);
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

        const createQuery = `
            CREATE (s:ShoppingNode {
                name: $name,
                price: $price,
                mall: $mall,
                source: $source,
                timestamp: CAST($timestamp AS TIMESTAMP)
            })
            RETURN s.id AS itemId
        `;
        const res = await this._runQuery(createQuery, {
            name: itemData.name || '',
            price: itemData.price || '',
            mall: itemData.mall || '',
            source: itemData.source || 'manual',
            timestamp
        });
        const results = [];
        while (res.hasNext()) {
            results.push(await res.getNext());
        }
        if (results.length === 0) throw new Error("Shopping item creation failed - no result");
        const resultObj = results[0];
        const itemId = resultObj.itemId !== undefined ? resultObj.itemId : (resultObj['s.id'] !== undefined ? resultObj['s.id'] : resultObj[Object.keys(resultObj)[0]]);

        const linkQuery = `
            MATCH (u:UserNode {id: $userId}), (s:ShoppingNode)
            WHERE s.id = $itemId
            CREATE (u)-[:UserSHOPPING]->(s)
        `;
        await this._runQuery(linkQuery, { userId, itemId });

        return itemId;
    }

    /**
     * 최근 대화 히스토리 조회
     */
    async getHistory(chatId, limit = 10) {
        const query = `
            MATCH (u:UserNode {id: $chatId})-[:UserSAYS]->(m:MessageNode)
            RETURN m.text AS text, m.intent AS intent, m.timestamp AS timestamp, m.sender AS sender
            ORDER BY m.timestamp DESC
            LIMIT $limit
        `;
        const res = await this._runQuery(query, { chatId: String(chatId), limit: parseInt(limit) });
        const results = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            results.push({
                text: row.text !== undefined ? row.text : (row['m.text'] !== undefined ? row['m.text'] : row[0]),
                intent: row.intent !== undefined ? row.intent : (row['m.intent'] !== undefined ? row['m.intent'] : row[1]),
                timestamp: row.timestamp !== undefined ? row.timestamp : (row['m.timestamp'] !== undefined ? row['m.timestamp'] : row[2]),
                sender: row.sender !== undefined ? row.sender : (row['m.sender'] !== undefined ? row['m.sender'] : row[3])
            });
        }
        return results;
    }

    /**
     * 사용자 인사이트 저장
     */
    async updateUserInsight(chatId, summary) {
        await this.ensureUser(chatId);
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');

        // 1. 기존 인사이트 관계 삭제
        const detachQuery = `
            MATCH (u:UserNode {id: $chatId})-[r:UserHAS_INSIGHT]->(i:InsightNode)
            DETACH DELETE i
        `;
        await this._runQuery(detachQuery, { chatId: String(chatId) });

        // 2. 새 인사이트 생성 및 주입
        const createQuery = `
            CREATE (i:InsightNode {summary: $summary, updatedAt: CAST($timestamp AS TIMESTAMP)})
            RETURN i.id AS insightId
        `;
        const res = await this._runQuery(createQuery, { summary, timestamp });
        const resultObj = await res.getNext();
        const insightId = resultObj.insightId !== undefined ? resultObj.insightId : (resultObj['i.id'] !== undefined ? resultObj['i.id'] : resultObj[0]);

        const linkQuery = `
            MATCH (u:UserNode {id: $chatId}), (i:InsightNode)
            WHERE i.id = $insightId
            CREATE (u)-[:UserHAS_INSIGHT]->(i)
        `;
        await this._runQuery(linkQuery, { chatId: String(chatId), insightId });
    }

    /**
     * 사용자 인사이트 조회
     */
    async getUserInsight(chatId) {
        const query = `
            MATCH (u:UserNode {id: $chatId})-[:UserHAS_INSIGHT]->(i:InsightNode)
            RETURN i.summary AS summary
            ORDER BY i.updatedAt DESC
            LIMIT 1
        `;
        const res = await this._runQuery(query, { chatId: String(chatId) });
        if (res.hasNext()) {
            const row = await res.getNext();
            return row.summary !== undefined ? row.summary : (row['i.summary'] !== undefined ? row['i.summary'] : row[0]);
        }
        return '';
    }

    /**
     * 토픽 기록 요약 조회
     */
    async getTopicSummary(chatId, options = {}) {
        const limit = options.limit || 5;
        const category = options.category;

        let query = `
            MATCH (u:UserNode {id: $chatId})-[:UserREQUESTS]->(t:TopicNode)
        `;
        const params = { chatId: String(chatId), limit: parseInt(limit) };

        if (category) {
            query += ` WHERE t.category = $category`;
            params.category = category;
        }

        query += `
            RETURN t.subject AS subject, t.category AS category, t.timestamp AS timestamp, t.source AS source
            ORDER BY t.timestamp DESC
            LIMIT $limit
        `;

        const res = await this._runQuery(query, params);
        const results = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            results.push({
                subject: row.subject !== undefined ? row.subject : (row['t.subject'] !== undefined ? row['t.subject'] : row[0]),
                category: row.category !== undefined ? row.category : (row['t.category'] !== undefined ? row['t.category'] : row[1]),
                timestamp: row.timestamp !== undefined ? row.timestamp : (row['t.timestamp'] !== undefined ? row['t.timestamp'] : row[2]),
                source: row.source !== undefined ? row.source : (row['t.source'] !== undefined ? row['t.source'] : row[3])
            });
        }
        return results;
    }

    /**
     * 쇼핑 아이템 요약 조회
     */
    async getShoppingSummary(chatId, options = {}) {
        const limit = options.limit || 5;
        const query = `
            MATCH (u:UserNode {id: $chatId})-[:UserSHOPPING]->(s:ShoppingNode)
            RETURN s.name AS name, s.price AS price, s.mall AS mall, s.timestamp AS timestamp
            ORDER BY s.timestamp DESC
            LIMIT $limit
        `;
        const res = await this._runQuery(query, { chatId: String(chatId), limit: parseInt(limit) });
        const results = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            results.push({
                name: row.name !== undefined ? row.name : (row['s.name'] !== undefined ? row['s.name'] : row[0]),
                price: row.price !== undefined ? row.price : (row['s.price'] !== undefined ? row['s.price'] : row[1]),
                mall: row.mall !== undefined ? row.mall : (row['s.mall'] !== undefined ? row['s.mall'] : row[2]),
                timestamp: row.timestamp !== undefined ? row.timestamp : (row['s.timestamp'] !== undefined ? row['s.timestamp'] : row[3])
            });
        }
        return results;
    }

    /**
     * 글로벌 시스템 통계
     */
    async getGlobalStats() {
        const stats = {};

        const queries = {
            users: "MATCH (u:UserNode) RETURN count(u)",
            messages: "MATCH (m:MessageNode) RETURN count(m)",
            topics: "MATCH (t:TopicNode) RETURN count(t)",
            shopping: "MATCH (s:ShoppingNode) RETURN count(s)"
        };

        for (const [key, q] of Object.entries(queries)) {
            const res = await this._runQuery(q);
            const row = await res.getNext();
            stats[key] = row[0] !== undefined ? row[0] : row[Object.keys(row)[0]];
        }

        return stats;
    }
    async close() {
        if (this.conn) {
            await this.conn.close();
            this.conn = null;
        }
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
        this.isInitialized = false;
        Logger.info('🔒 [Kuzu] 데이터베이스 연결이 닫혔습니다.');
    }
}

module.exports = new KuzuService();
