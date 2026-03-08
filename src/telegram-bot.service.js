const TelegramBot = require('node-telegram-bot-api');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

class TelegramBotService {
    static bot = null;
    static isInitialized = false;
    static pendingRequests = new Map(); // 사용자 확인 대기 중인 파싱 데이터 관리
    static chatContext = new Map(); // chatId별 마지막 성공 토픽 주제 저장용

    static init() {
        // [Fun Factor] 상황별 다양한 메시지 정의
        this.messages = {
            topic_added: [
                '✅ 글감이 시트 대기열에 성공적으로 등록되었습니다! 곧 발행 프로세스가 시작됩니다 🚀',
                '✅ 오케이! 시트 대기열에 담아뒀어요. 잠시만 기다려 주시면 발행 뚝딱 해드릴게요! 👩‍🍳',
                '✅ 접수 완료! 토픽 리스트에 잘 올려두었습니다. 곧 원고 작성을 시작할게요 ✨',
                '✅ 글감 등록 성공! 이제 제가 바빠질 차례네요. 조금만 기다려 주세요! 🏃‍♂️💨'
            ],
            publishing_start: [
                '⚙️ 자동 발행 파이프라인에 시동을 걸었습니다. 발행이 완료되면 알려드릴게요!',
                '⚙️ 뚝딱뚝딱... 글을 굽기 시작했어요! 완료 소식 금방 들고 올게요 🥧',
                '⚙️ 엔진 가동! 선택하신 플랫폼으로 발행을 시작합니다. 잠시만요! 🚀',
                '⚙️ 원고 작성 및 발행 루틴을 시작합니다. 결과는 바로 보고드릴게요! 📈'
            ],
            busy: [
                '⏳ 현재 백그라운드에서 다른 자동 발행이 진행 중입니다. 지금 등록하신 건은 앞선 작업이 끝나는 대로 이어서 처리해 드릴게요! 😉',
                '⏳ 봇 엔진이 열일 중입니다! (다른 작업 진행 중) 조금만 기다려 주시면 순서대로 발행해 드릴게요. 🙇‍♂️',
                '⏳ 앞서 요청하신 작업이 진행 중이네요. 이번 건도 대기열에 잘 넣어두었으니 걱정 마세요! 📋'
            ],
            welcome: [
                `📖 *블로그 자동 발행 비서 안내*
                
안녕하세요! 원격으로 블로그 글 발행을 도와드리는 비서입니다. 
원하시는 주제나 키워드를 편하게 말씀해 주시면 제가 알아서 정리해서 발행을 준비해 드릴게요. 😉`,
                `✨ *반가워요! 당신의 블로그 도우미입니다*

주제만 툭 던져주시면 인공지능이 맥락을 파악해 글을 써드려요. 
"아까 그 주제로 워드프레스에도 올려줘" 같은 똑똑한 명령도 알아듣는답니다! 🧠`
            ]
        };

        if (this.isInitialized && this.bot) {
            // Logger.info('🔄 [TelegramBot] 기존 봇 인스턴스가 이미 실행 중입니다.');
            return;
        }


        const enabled = CONFIG.NOTIFY_TELEGRAM_ENABLED;
        const botToken = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
        const chatId = String(CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim();

        if (!enabled || !botToken) {
            Logger.info('ℹ️ [TelegramBot] 텔레그램 알림이 비활성화되어 있거나 설정이 누락되어 수신 봇을 시작하지 않습니다.');
            return;
        }

        try {
            // Polling 방식으로 봇 인스턴스 생성
            this.bot = new TelegramBot(botToken, { polling: true });
            this.isInitialized = true;
            Logger.info('✅ [TelegramBot] 텔레그램 수신 봇 데몬이 성공적으로 시작되었습니다. (Long Polling)');

            this.setupListeners(chatId);
        } catch (error) {
            Logger.error(`❌ [TelegramBot] 텔레그램 수신 봇 시작 실패: ${error.message}`);
        }
    }

    static setupListeners(allowedChatId) {
        if (!this.bot) return;

        // 에러 핸들링
        this.bot.on('polling_error', (error) => {
            Logger.error(`❌ [TelegramBot] Polling Error: ${error.message}`);
        });

        const handleIncoming = async (msg) => {
            const chatId = String(msg.chat.id);
            const text = msg.text || '';

            // 1. 보안 체크: 승인된 chatId인지 확인
            if (allowedChatId && chatId !== allowedChatId) {
                Logger.warn(`⚠️ [TelegramBot] 비인가 채팅방에서의 접근 시도 (방 ID: ${chatId}) / 차단함.`);
                return;
            }

            Logger.info(`💬 [TelegramBot] 메시지 수신: ${text}`);

            // 2. 명령어 처리 (/help 등)
            if (text.startsWith('/')) {
                await this.handleCommand(chatId, text);
                return;
            }

            // 3. 일반 자연어 메시지 (Phase 2: AI 파싱 및 확인 대기)
            try {
                // 임시 응답 
                const loadingMsg = await this.bot.sendMessage(
                    chatId,
                    '🤖 쓰신 내용을 열심히 읽고 분석 중입니다... 잠시만 기다려주세요! ⏳',
                    { parse_mode: 'Markdown' }
                );

                // AI 파싱 (맥락 정보 포함)
                const Core = require('./core');
                const context = this.chatContext.get(chatId) || null;
                const parsedData = await Core.parseTelegramRequest(text, context);
                const { intent, data } = parsedData;

                // 인텐트별 분기 처리 (Dispatcher)
                if (intent === 'PUBLISH') {
                    const optionsObj = data.options || {};
                    let platformsStr = (data.platforms || ['naver']).map(p => p.toLowerCase() === 'wordpress' ? '워드프레스' : '네이버 블로그').join(', ');
                    let imgGenIcon = optionsObj.image_gen !== false ? '✅' : '❌';
                    let extRefIcon = optionsObj.external_reference !== false ? '✅' : '❌';

                    let confirmMsg = `✨ *분석 완료!* 다음 조건으로 발행을 준비할까요?\n\n` +
                        `🎯 *주제:* ${data.theme}\n` +
                        `🔑 *키워드:* ${(data.keywords || []).join(', ') || '없음'}\n` +
                        `🏷️ *발행 대상:* ${platformsStr}\n` +
                        `🖼️ *이미지 생성:* ${imgGenIcon}\n` +
                        `🔍 *외부 자료 참고:* ${extRefIcon}\n`;

                    if (optionsObj.schedule_date) confirmMsg += `⏰ *예약 일시:* ${optionsObj.schedule_date}\n`;
                    if (optionsObj.instruction) confirmMsg += `📝 *추가 지시:* ${optionsObj.instruction}\n`;
                    if (optionsObj.category) confirmMsg += `📁 *카테고리:* ${optionsObj.category}\n`;
                    if (optionsObj.post_status === 'draft') confirmMsg += `📌 *발행 옵션:* 임시저장(Draft)\n`;

                    const options = {
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{ text: '✅ 네, 진행해 주세요', callback_data: 'publish_confirm' }],
                                [{ text: '❌ 아뇨, 취소할게요', callback_data: 'publish_cancel' }]
                            ]
                        })
                    };

                    const sentMsg = await this.bot.sendMessage(chatId, confirmMsg, options);
                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => { });

                } else if (intent === 'UPDATE_CONFIG') {
                    // 설정 변경은 중요하므로 확인 절차 거침
                    const updates = data.config_updates || {};
                    let summary = '';
                    for (const [k, v] of Object.entries(updates)) {
                        summary += `• \`${k}\` ➔ \`${v}\`\n`;
                    }

                    const confirmMsg = `⚙️ *시스템 설정 변경 요청이 감지되었습니다.*\n\n${summary}\n정말 변경할까요? (즉시 반영됩니다)`;
                    const options = {
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{ text: '✅ 예, 변경합니다', callback_data: 'config_confirm' }],
                                [{ text: '❌ 취소', callback_data: 'publish_cancel' }]
                            ]
                        })
                    };
                    const sentMsg = await this.bot.sendMessage(chatId, confirmMsg, options);
                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => { });

                } else if (intent === 'RUN_JOB') {
                    // 작업 실행 (예: 트렌드 수집)
                    const jobName = data.job_name || '알 수 없는 작업';
                    const confirmMsg = `🚀 *시스템 작업을 실행할까요?*\n\n작업: \`${jobName}\`\n\n(완료 후 알림을 보내드릴게요)`;
                    const options = {
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{ text: '✅ 실행하기', callback_data: 'job_confirm' }],
                                [{ text: '❌ 취소', callback_data: 'publish_cancel' }]
                            ]
                        })
                    };
                    const sentMsg = await this.bot.sendMessage(chatId, confirmMsg, options);
                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => { });

                } else if (intent === 'QUERY_DATA') {
                    // 데이터 조회는 즉시 실행
                    await this.bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => { });
                    await this.handleQueryIntent(chatId, data);
                }

            } catch (err) {
                Logger.error(`❌ [TelegramBot] 메시지 분석 실패: ${err.message}`);
                await this.bot.sendMessage(chatId, '😥 죄송합니다. 요청하신 내용을 분석하는 데 실패했습니다. 다시 말씀해 주시겠어요?');
            }
        };

        // 1:1 채팅 및 그룹방 메시지 수신
        this.bot.on('message', handleIncoming);
        // 채널 메시지 수신
        this.bot.on('channel_post', handleIncoming);

        // 콜백(버튼 클릭) 쿼리 리스너
        this.bot.on('callback_query', async (query) => {
            const chatId = String(query.message.chat.id);
            const messageId = query.message.message_id;
            const data = query.data;

            if (allowedChatId && chatId !== allowedChatId) return;

            const requestKey = `${chatId}_${messageId}`;

            try {
                if (data === 'publish_cancel') {
                    this.pendingRequests.delete(requestKey);
                    await this.bot.editMessageText('❌ 발행 요청이 취소되었습니다.', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } else if (data === 'publish_confirm') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    if (!parsedData || !parsedData.data) {
                        await this.bot.answerCallbackQuery(query.id, { text: '세션이 만료되었거나 이미 처리된 요청입니다.', show_alert: true });
                        return;
                    }

                    const Utils = require('./utils');
                    const axios = require('axios');
                    const CONFIG = require('./config-loader');

                    const newTopics = [];
                    const pData = parsedData.data;
                    // 플랫폼별로 분리해서 행 생성
                    const platforms = pData.platforms || ['naver'];
                    for (const p of platforms) {
                        newTopics.push({
                            subject: pData.theme,
                            keywords: pData.keywords,
                            options: {
                                ...pData.options,
                                platforms: [p.toLowerCase().includes('wordpress') ? 'wordpress' : 'naver']
                            },
                            source: 'telegram'
                        });
                    }

                    // SpreadSheet 에 등록 ('발행 준비 완료' 상태로)
                    const appendRes = await Utils.appendGoogleSheetTopics(newTopics, { defaultStatus: '발행 준비 완료' });
                    const addedRowIndices = appendRes?.rowIndices || [];

                    // [Context Store] 성공적으로 등록된 주제를 맥락 메모리에 저장
                    if (pData.theme) {
                        this.chatContext.set(chatId, pData.theme);
                        Logger.info(`💾 [TelegramBot] 맥락 저장 완료 (${chatId}): ${pData.theme}`);
                    }

                    this.pendingRequests.delete(requestKey);

                    await this.bot.editMessageText(this.getRandomMessage('topic_added'), {
                        chat_id: chatId,
                        message_id: messageId
                    });

                    // 향후 추가될 강제 트리거 등 위치 (Phase 4: 발행 파이프라인 트리거)
                    try {
                        const port = CONFIG.UI_SERVER_PORT || 4577;

                        // 현재 상태 확인 (다른 발행이 돌고 있는지 체크)
                        const statusRes = await axios.get(`http://127.0.0.1:${port}/api/v1/auto/status`);
                        const isRunning = statusRes.data?.data?.running === true;

                        if (isRunning) {
                            await this.bot.sendMessage(chatId, this.getRandomMessage('busy'));
                        } else if (addedRowIndices.length > 0) {
                            // 발행 트리거
                            await this.bot.sendMessage(chatId, this.getRandomMessage('publishing_start'));
                            // 백그라운드로 던짐 (await 하지 않음)
                            axios.post(`http://127.0.0.1:${port}/api/v1/auto/publish/run`, {
                                targetRowIndices: addedRowIndices,
                                settingsOverrides: {
                                    PUBLISH_AUTO_HEADLESS: true // 텔레그램 요청은 가급적 Headless 모드로 조용히 실행
                                }
                            }).catch(e => {
                                Logger.error(`❌ [TelegramBot] 발행 트리거 API 호출 실패: ${e.message}`);
                            });
                        }
                    } catch (apiErr) {
                        Logger.error(`❌ [TelegramBot] 상태 확인 또는 발행 루틴 호출 실패: ${apiErr.message}`);
                    }
                } else if (data === 'config_confirm') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    if (!parsedData || !parsedData.data || !parsedData.data.config_updates) {
                        await this.bot.answerCallbackQuery(query.id, { text: '설정 정보가 없거나 세션이 만료되었습니다.', show_alert: true });
                        return;
                    }

                    const axios = require('axios');
                    const CONFIG = require('./config-loader');
                    const port = CONFIG.UI_SERVER_PORT || 4577;

                    try {
                        // Settings API 호출 (Major 설정을 통해 JSON 구조 업데이트)
                        // 주의: AI가 보낸 키-값 쌍을 API 스펙에 맞춰 전달해야 함.
                        // 여기서는 단순화를 위해 /api/v1/settings/major 에 직접 필드를 보냄.
                        await axios.post(`http://127.0.0.1:${port}/api/v1/settings/major`, parsedData.data.config_updates);

                        this.pendingRequests.delete(requestKey);
                        await this.bot.editMessageText('✅ 시스템 설정이 성공적으로 변경되었습니다. (즉시 반영됨)', {
                            chat_id: chatId,
                            message_id: messageId
                        });
                    } catch (err) {
                        Logger.error(`❌ [TelegramBot] 설정 변경 요청 실패: ${err.message}`);
                        await this.bot.sendMessage(chatId, `❌ 설정 변경 중 오류가 발생했습니다: ${err.message}`);
                    }

                } else if (data === 'job_confirm') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    if (!parsedData || !parsedData.data || !parsedData.data.job_name) {
                        await this.bot.answerCallbackQuery(query.id, { text: '작업 정보가 없거나 세션이 만료되었습니다.', show_alert: true });
                        return;
                    }

                    const axios = require('axios');
                    const CONFIG = require('./config-loader');
                    const port = CONFIG.UI_SERVER_PORT || 4577;
                    const jobName = parsedData.data.job_name.toLowerCase();

                    let endpoint = '';
                    if (jobName.includes('trend')) endpoint = '/api/v1/auto/collect/trends/run';
                    else if (jobName.includes('rss')) endpoint = '/api/v1/auto/collect/rss/run';
                    else if (jobName.includes('publish') || jobName.includes('shopping')) endpoint = '/api/v1/auto/publish/run';

                    if (!endpoint) {
                        await this.bot.sendMessage(chatId, `❌ 알 수 없는 작업입니다: ${jobName}`);
                        return;
                    }

                    try {
                        await axios.post(`http://127.0.0.1:${port}${endpoint}`, parsedData.data.job_params || {});
                        this.pendingRequests.delete(requestKey);
                        await this.bot.editMessageText(`🚀 \`${jobName}\` 작업이 시작되었습니다. 결과는 알림으로 보고드릴게요!`, {
                            chat_id: chatId,
                            message_id: messageId
                        });
                    } catch (err) {
                        Logger.error(`❌ [TelegramBot] 작업 실행 요청 실패: ${err.message}`);
                        await this.bot.sendMessage(chatId, `❌ 작업 실행 중 오류가 발생했습니다: ${err.message}`);
                    }
                }

                // 버튼 로딩 해제
                await this.bot.answerCallbackQuery(query.id);
            } catch (err) {
                Logger.error(`❌ [TelegramBot] 콜백 처리 실패: ${err.message}`);
                await this.bot.answerCallbackQuery(query.id, { text: '처리 중 오류가 발생했습니다.', show_alert: true });
            }
        });
    }



    static async handleCommand(chatId, commandText) {
        const cmd = commandText.split(' ')[0].toLowerCase();

        try {
            if (cmd === '/start' || cmd === '/help') {
                let helpMsg = this.getRandomMessage('welcome') + '\n\n' +
                    `*에이전트에게 이렇게 명령해 보세요:*\n` +
                    `📝 *콘텐츠 발행*\n` +
                    `💬 _"경주 맛집에 대해 블로그 글 하나 써줘"_\n` +
                    `💬 _"아까 그 주제로 워드프레스에도 올려줄래?"_\n\n` +
                    `⚙️ *시스템 제어*\n` +
                    `💬 _"발행 주기를 30분으로 변경해줘"_\n` +
                    `💬 _"지금 트렌드 수집 시작해줘"_\n\n` +
                    `📊 *상태 조회*\n` +
                    `💬 _"지금 시스템 상태 어때?"_\n` +
                    `💬 _"대기 중인 글감 몇 개인지 알려줘"_\n\n` +
                    `무엇이든 편하게 말씀해 보세요! 🚀`;

                await this.bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
            } else {
                await this.bot.sendMessage(chatId, `알 수 없는 명령어입니다: ${cmd}\n/help 를 입력해보세요.`);
            }
        } catch (err) {
            Logger.error(`❌ [TelegramBot] 명령 응답 실패: ${err.message}`);
        }
    }

    /**
     * [Universal Agent] 데이터 조회 처리
     */
    static async handleQueryIntent(chatId, data) {
        const queryType = data.query_type || 'status';
        const axios = require('axios');
        const CONFIG = require('./config-loader');
        const port = CONFIG.UI_SERVER_PORT || 4577;

        try {
            if (queryType === 'status' || queryType === 'system') {
                const res = await axios.get(`http://127.0.0.1:${port}/api/v1/auto/status`);
                const s = res.data?.data;
                const statusMsg = `📊 *자동발행 예약 현황*\n\n` +
                    `• *상태:* ${s.status === 'running' ? '🟢 실행 중' : (s.status === 'waiting' ? '🟡 대기 중' : '⚪️ 정지')}\n` +
                    `• *다음 발행:* ${this.escapeMarkdown(s.nextRunAt || '없음')}\n` +
                    `• *오늘 발행량:* ${s.cycleCount || 0}건\n` +
                    `• *메시지:* ${this.escapeMarkdown(s.message || '정상')}`;
                await this.bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
            } else {
                await this.bot.sendMessage(chatId, `ℹ️ 요청하신 \`${queryType}\` 조회 기능은 현재 준비 중입니다. 곧 만나보실 수 있어요!`);
            }
        } catch (err) {
            Logger.error(`❌ [TelegramBot] 쿼리 요청 실패: ${err.message}`);
            await this.bot.sendMessage(chatId, `❌ 데이터 조회 중 오류가 발생했습니다: ${err.message}`);
        }
    }

    /**
     * [Fun Factor] 랜덤 메시지 추출기
     */
    static getRandomMessage(type) {
        if (!this.messages || !this.messages[type]) return '명령을 확인했습니다.';
        const list = this.messages[type];
        return list[Math.floor(Math.random() * list.length)];
    }

    /**
     * [Notify] 외부 모듈에서 알림 메시지를 보낼 때 사용 (Config의 ChatId 자동 사용)
     */
    static async sendNotification(text, options = {}) {
        const enabled = CONFIG.NOTIFY_TELEGRAM_ENABLED;
        const botToken = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
        const chatId = CONFIG.NOTIFY_TELEGRAM_CHAT_ID;

        if (!enabled || !botToken || !chatId || !this.bot) {
            // Logger.info('ℹ️ [TelegramBot] 알림이 비활성화되어 있거나 봇이 시작되지 않아 메시지를 보내지 않습니다.');
            return false;
        }

        try {
            // [Markdown Fix] 전체 텍스트에 마크다운이 포함되어 있지 않다면 안전하게 이스케이프할 수 있지만,
            // 이미 마크다운 태그(*, [ 등)가 포함된 경우라면 선별적으로 적용해야 합니다.
            // 여기서는 기본적으로 parse_mode를 사용하므로 호출부에서 이스케이프된 텍스트를 주거나,
            // 아래와 같이 옵션으로 제어할 수 있게 둡니다.
            await this.bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                ...options
            });
            return true;
        } catch (err) {
            Logger.error(`❌ [TelegramBot] 알림 전송 실패: ${err.message}`);
            return false;
        }
    }

    static stop() {
        if (this.bot) {
            try {
                this.bot.stopPolling();
                this.bot = null;
                this.isInitialized = false;
                Logger.info('🛑 [TelegramBot] 텔레그램 수신 봇 데몬을 중지했습니다.');
            } catch (err) {
                Logger.error(`❌ [TelegramBot] 봇 중지 실패: ${err.message}`);
            }
        }
    }

    /**
     * Telegram Markdown(V1) 특수문자 이스케이프
     * _, *, [, ` 등 마크다운 예약 문자를 처리합니다.
     */
    static escapeMarkdown(text) {
        if (!text) return '';
        return String(text)
            .replace(/_/g, '\\_')
            .replace(/\*/g, '\\*')
            .replace(/\[/g, '\\[')
            .replace(/`/g, '\\`');
    }
}

module.exports = TelegramBotService;
