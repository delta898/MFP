const TelegramBot = require('node-telegram-bot-api');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const KuzuDB = require('./kuzu-service');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createAgentRuntime } = require('./agent/runtime');
const { createPlanner } = require('./agent/planner');
const { createCapabilityRegistry } = require('./capabilities');
const { KuzuEventStore } = require('./memory/event-store');
const { createMemoryRetrievalService } = require('./memory/retrieval-service');
const { parseTelegramAgentEnvelope, tryParseDeterministicEnvelope } = require('./agent/telegram-parser');
const TelegramAgentRenderer = require('./channels/telegram/renderer');
const { getRuntimeHooks } = require('./runtime-hooks');

class TelegramBotService {
    static bot = null;
    static isInitialized = false;
    static pendingRequests = new Map(); // 사용자 확인 대기 중인 파싱 데이터 관리
    static chatContext = new Map(); // chatId별 마지막 성공 토픽 주제 저장용
    static agentRuntime = null;
    static agentPlanner = null;
    static agentEventStore = null;
    static agentRetrieval = null;
    static _pollingErrorCount = 0;
    static _pollingErrorWindowStart = 0;
    static POLLING_ERROR_THRESHOLD = 5; // 연속 에러 N회 초과 시 자동 중지
    static POLLING_ERROR_WINDOW_MS = 60000; // 에러 카운트 리셋 윈도우 (60초)

    static async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    static _getRetryAfterSeconds(error) {
        const bodyRetryAfter = Number(error?.response?.body?.parameters?.retry_after);
        const rawRetryAfter = Number(error?.response?.parameters?.retry_after);
        const textMatch = String(error?.message || '').match(/retry after\s+(\d+)/i);
        return bodyRetryAfter || rawRetryAfter || Number(textMatch?.[1] || 0) || 0;
    }

    static async callTelegramApi(methodName, args = [], options = {}) {
        const retries = Number.isFinite(Number(options.retries)) ? Math.max(0, Number(options.retries)) : 1;
        const silent = options.silent === true;
        const bot = this.bot;
        if (!bot || typeof bot[methodName] !== 'function') {
            if (silent) return null;
            throw new Error(`Telegram bot method unavailable: ${methodName}`);
        }

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                return await bot[methodName](...args);
            } catch (error) {
                lastError = error;
                const statusCode = Number(error?.response?.statusCode || error?.response?.status || 0);
                const retryAfterSeconds = this._getRetryAfterSeconds(error);
                const canRetry = statusCode === 429 && attempt < retries;
                if (canRetry) {
                    Logger.warn(`⚠️ [TelegramBot] ${methodName} rate limited. retry after ${retryAfterSeconds || 1}s`);
                    await this.sleep(Math.max(1, retryAfterSeconds || 1) * 1000);
                    continue;
                }
                if (!silent) {
                    Logger.warn(`⚠️ [TelegramBot] ${methodName} failed: ${error.message}`);
                }
                break;
            }
        }

        if (silent) return null;
        throw lastError;
    }

    static async startLoadingIndicator(chatId) {
        const loadingMessages = [
            '⏳ 잠깐만요. 내용을 보고 있습니다.',
            '⏳ 요청을 확인하고 있습니다. 잠시만요.',
            '⏳ 맥락을 정리하고 있습니다. 조금만 기다려주세요.',
            '⏳ 확인 중입니다. 곧 답을 드리겠습니다.'
        ];
        const message = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
        const sent = await this.callTelegramApi('sendMessage', [chatId, message], { retries: 1, silent: true });
        if (!sent?.message_id) {
            return { messageId: null };
        }
        return {
            messageId: sent?.message_id || null
        };
    }

    static async stopLoadingIndicator(chatId, loadingState) {
        if (!loadingState) return;
        if (loadingState.messageId) {
            await this.callTelegramApi('deleteMessage', [chatId, loadingState.messageId], { retries: 0, silent: true });
        }
    }

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

        // 안전장치: 이전 인스턴스가 완전히 정리되지 않은 경우 먼저 중지
        if (this.bot) {
            try {
                this.bot.stopPolling();
            } catch (e) { /* ignore */ }
            this.bot = null;
            this.isInitialized = false;
        }


        const enabled = CONFIG.NOTIFY_TELEGRAM_ENABLED;
        const botToken = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
        const chatId = String(CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim();

        if (!enabled || !botToken) {
            Logger.info('ℹ️ [TelegramBot] 텔레그램 알림이 비활성화되어 있거나 설정이 누락되어 수신 봇을 시작하지 않습니다.');
            return;
        }

        try {
            this.ensureAgentRuntime();

            // [Persistent Memory] Kuzu DB 초기화
            if (KuzuDB && typeof KuzuDB.initialize === 'function') {
                KuzuDB.initialize().catch(err => {
                    Logger.error(`❌ [TelegramBot] Kuzu 서비스 초기화 실패: ${err.message}`);
                });
            }
            if (this.agentEventStore && typeof this.agentEventStore.initialize === 'function') {
                this.agentEventStore.initialize().catch(err => {
                    Logger.error(`❌ [TelegramBot] Agent EventStore 초기화 실패: ${err.message}`);
                });
            }

            // Polling 방식으로 봇 인스턴스 생성
            this.bot = new TelegramBot(botToken, { polling: true });
            this.isInitialized = true;
            Logger.info('✅ [TelegramBot] 텔레그램 수신 봇 데몬이 성공적으로 시작되었습니다. (Long Polling)');

            this.setupListeners(chatId);
        } catch (error) {
            Logger.error(`❌ [TelegramBot] 텔레그램 수신 봇 시작 실패: ${error.message}`);
        }
    }

    static ensureAgentRuntime() {
        if (this.agentRuntime) return this.agentRuntime;

        this.agentEventStore = new KuzuEventStore({
            Logger,
            baseDir: process.cwd()
        });

        const hooks = getRuntimeHooks();
        const resolveWritableConfigPath = hooks.resolveWritableConfigPath
            || (() => CONFIG.CONFIG_SOURCE_PATH || CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));
        const buildDefaultConfigTemplate = hooks.buildDefaultConfigTemplate || (() => '{}');
        const syncAutoRunnerWithConfig = hooks.syncAutoRunnerWithConfig || (() => { });
        const syncShoppingAutoRunnerWithConfig = hooks.syncShoppingAutoRunnerWithConfig || (() => { });
        const resolveNaverAutoCategoryCatalog = hooks.resolveNaverAutoCategoryCatalog || null;

        const capabilityRegistry = createCapabilityRegistry({
            fs,
            path,
            axios,
            Logger,
            CONFIG,
            eventStore: this.agentEventStore,
            resolveWritableConfigPath,
            buildDefaultConfigTemplate,
            syncAutoRunnerWithConfig,
            syncShoppingAutoRunnerWithConfig,
            resolveNaverAutoCategoryCatalog
        });

        this.agentRuntime = createAgentRuntime({
            capabilityRegistry,
            eventStore: this.agentEventStore
        });
        this.agentPlanner = createPlanner({
            capabilityRegistry,
            CONFIG
        });
        this.agentRetrieval = createMemoryRetrievalService({
            eventStore: this.agentEventStore,
            confirmationStore: this.agentRuntime.confirmationStore
        });

        return this.agentRuntime;
    }

    static buildAgentContext(chatId, msgOrQuery = {}) {
        const numericChatId = String(chatId || '').trim();
        const username = String(msgOrQuery?.chat?.username || msgOrQuery?.from?.username || '').trim();
        return {
            channel: 'telegram',
            user: {
                id: numericChatId,
                channel: 'telegram',
                username
            },
            conversation: {
                id: `telegram:${numericChatId}`,
                channel: 'telegram'
            },
            messageId: String(msgOrQuery?.message_id || msgOrQuery?.id || '').trim()
        };
    }

    static isAgentCapabilityHelpRequest(text) {
        const normalized = String(text || '').trim().toLowerCase();
        if (!normalized) return false;
        return [
            '네가 할 수 있는 일',
            '네가 할 수 있는 일 나열',
            '할 수 있는 일',
            '할수있는일',
            '무엇을 할 수 있어',
            '뭘 할 수 있어',
            '무슨 일을 할 수 있어',
            '지원하는 기능',
            '가능한 명령'
        ].some((keyword) => normalized.includes(keyword));
    }

    static formatAgentCapabilityHelpMessage() {
        return TelegramAgentRenderer.formatCapabilityHelpMessage();
    }

    static async tryHandleAgentRequest(chatId, text, msg, options = {}) {
        if (this.isAgentCapabilityHelpRequest(text)) {
            await this.bot.sendMessage(chatId, this.formatAgentCapabilityHelpMessage(), { parse_mode: 'Markdown' });
            return { handled: true };
        }

        const runtime = this.ensureAgentRuntime();
        const context = this.buildAgentContext(chatId, msg);
        context.messageId = String(msg?.message_id || '').trim();
        context.memory = await this.agentRetrieval.buildContextPacket({
            conversationId: context.conversation.id,
            userId: context.user.id,
            limit: 8
        });

        if (this.agentEventStore) {
            await this.agentEventStore.appendEvent({
                event_type: 'user.message.received',
                actor_type: 'user',
                actor_id: context.user.id,
                conversation_id: context.conversation.id,
                message_id: context.messageId,
                payload: {
                    text
                },
                user: context.user,
                conversation: context.conversation
            }).catch(() => { });
        }

        const envelope = options.preParsedEnvelope || await parseTelegramAgentEnvelope(text, {
            conversationId: context.conversation.id,
            messageId: context.messageId,
            memory: context.memory
        });

        if (!Array.isArray(envelope?.actions) || envelope.actions.length === 0) {
            return { handled: false };
        }

        const planResult = await this.agentPlanner.buildPlan(envelope, context);
        if (!planResult.ok) {
            Logger.debug(`⚠️ [TelegramBot] Agent plan rejected: ${(planResult.errors || []).join(' | ')}`);
            await this.bot.sendMessage(chatId, `❌ 요청을 처리하지 못했습니다.\n\n사유: ${(planResult.errors || []).join('\n')}`);
            return { handled: true };
        }

        const outcome = await runtime.handlePlan(planResult.plan, context);
        if (!outcome.ok) {
            Logger.debug(`⚠️ [TelegramBot] Agent runtime rejected: ${(outcome.errors || []).join(' | ')}`);
            await this.bot.sendMessage(chatId, `❌ 요청을 처리하지 못했습니다.\n\n사유: ${(outcome.errors || []).join('\n')}`);
            return { handled: true };
        }

        if (outcome.status === 'confirmation_required') {
            const confirmationId = outcome.confirmation?.id;
            const message = TelegramAgentRenderer.formatPreviewMessage(outcome.confirmation, outcome.previews);
            const sent = await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [
                            { text: '❌ 취소', callback_data: `agent_reject:${confirmationId}` },
                            { text: '✅ 적용', callback_data: `agent_confirm:${confirmationId}` }
                        ]
                    ]
                })
            });
            if (confirmationId) {
                runtime.confirmationStore.bindTransportMessage(confirmationId, {
                    chatId: String(chatId || '').trim(),
                    messageId: String(sent?.message_id || '').trim()
                });
            }
            const supersededId = String(outcome.confirmation?.supersededConfirmationId || '').trim();
            if (supersededId) {
                const superseded = runtime.confirmationStore.get(supersededId);
                let supersededEdited = false;
                if (superseded?.transportChatId && superseded?.transportMessageId) {
                    await this.bot.editMessageText(TelegramAgentRenderer.formatSupersededConfirmationMessage(), {
                        chat_id: /^-?\d+$/.test(String(superseded.transportChatId)) ? Number(superseded.transportChatId) : superseded.transportChatId,
                        message_id: Number(superseded.transportMessageId),
                        reply_markup: { inline_keyboard: [] }
                    }).then(() => {
                        supersededEdited = true;
                    }).catch((error) => {
                        Logger.debug(`⚠️ [TelegramBot] Superseded confirmation edit failed: ${error.message}`);
                    });
                }
                if (!supersededEdited) {
                    await this.bot.sendMessage(chatId, 'ℹ️ 이전 확인 요청은 더 최신 요청으로 대체되었습니다. 아래 최신 카드로 계속 진행하세요.').catch(() => { });
                }
            }
            return { handled: true };
        }

        if (outcome.status === 'completed') {
            const suggestionKeyboard = TelegramAgentRenderer.buildSuggestionKeyboard(outcome.results);
            const artifactKeyboard = TelegramAgentRenderer.buildArtifactKeyboard(outcome.results);
            const options = {
                parse_mode: 'Markdown'
            };
            const inlineKeyboard = [...suggestionKeyboard, ...artifactKeyboard];
            if (inlineKeyboard.length > 0) {
                options.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
            }
            await this.bot.sendMessage(chatId, TelegramAgentRenderer.formatExecutionMessage(outcome.results), options);
            return { handled: true };
        }

        return { handled: false };
    }

    static async handleAgentCallback(chatId, messageId, data, query) {
        const runtime = this.ensureAgentRuntime();
        const parts = String(data || '').split(':');
        const verb = parts[0];
        const targetId = parts[parts.length - 1];
        if (!targetId) return false;

        if (verb === 'suggest_feedback') {
            const context = this.buildAgentContext(chatId, query?.message || {});
            context.messageId = String(messageId || '').trim();
            const feedback = String(parts[1] || '').trim();
            const eventType = feedback === 'accepted'
                ? 'suggestion.accepted'
                : feedback === 'rejected'
                    ? 'suggestion.rejected'
                    : feedback === 'helpful'
                        ? 'suggestion.helpful'
                        : 'suggestion.not_helpful';
            await this.agentEventStore.appendEvent({
                event_type: eventType,
                actor_type: 'user',
                actor_id: context.user.id,
                conversation_id: context.conversation.id,
                message_id: context.messageId,
                payload: {
                    suggestion_id: targetId
                },
                user: context.user,
                conversation: context.conversation
            }).catch(() => { });

            await this.bot.answerCallbackQuery(query.id, {
                text: feedback === 'accepted'
                    ? '추천을 수락했습니다.'
                    : feedback === 'rejected'
                        ? '추천을 거절했습니다.'
                        : feedback === 'helpful'
                            ? '도움됨으로 기록했습니다.'
                            : '별로로 기록했습니다.'
            });
            return true;
        }

        if (verb === 'artifact_feedback') {
            const context = this.buildAgentContext(chatId, query?.message || {});
            context.messageId = String(messageId || '').trim();
            const feedback = String(parts[1] || '').trim();
            const eventType = feedback === 'helpful' ? 'artifact.helpful' : 'artifact.not_helpful';
            await this.agentEventStore.appendEvent({
                event_type: eventType,
                actor_type: 'user',
                actor_id: context.user.id,
                conversation_id: context.conversation.id,
                message_id: context.messageId,
                payload: {
                    artifact_id: targetId,
                    feedback
                },
                user: context.user,
                conversation: context.conversation
            }).catch(() => { });

            await this.bot.answerCallbackQuery(query.id, {
                text: feedback === 'helpful' ? '도움됨으로 기록했습니다.' : '별로로 기록했습니다.'
            });
            return true;
        }

        const context = this.buildAgentContext(chatId, query?.message || {});
        context.messageId = String(messageId || '').trim();

        const decision = verb === 'agent_confirm' ? 'approve' : 'reject';
        const outcome = await runtime.handleConfirmationDecision({ confirmationId: targetId, decision }, context);

        if (!outcome.ok) {
            await this.bot.answerCallbackQuery(query.id, { text: outcome.message || '처리하지 못했습니다.', show_alert: true });
            return true;
        }

        if (outcome.status === 'rejected') {
            await this.bot.editMessageText('❌ 설정 변경 요청이 취소되었습니다.', {
                chat_id: chatId,
                message_id: messageId
            });
            await this.bot.answerCallbackQuery(query.id);
            return true;
        }

        if (outcome.status === 'executed') {
            await this.bot.editMessageText(TelegramAgentRenderer.formatExecutionMessage(outcome.results), {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            await this.bot.answerCallbackQuery(query.id);
            return true;
        }

        return false;
    }

    static setupListeners(allowedChatId) {
        if (!this.bot) return;

        // 에러 핸들링 (연속 에러 시 자동 중지)
        this.bot.on('polling_error', (error) => {
            const now = Date.now();
            // 윈도우 리셋: 마지막 에러로부터 충분한 시간이 지났으면 카운터 초기화
            if (now - TelegramBotService._pollingErrorWindowStart > TelegramBotService.POLLING_ERROR_WINDOW_MS) {
                TelegramBotService._pollingErrorCount = 0;
                TelegramBotService._pollingErrorWindowStart = now;
            }
            TelegramBotService._pollingErrorCount++;

            if (TelegramBotService._pollingErrorCount <= TelegramBotService.POLLING_ERROR_THRESHOLD) {
                Logger.error(`❌ [TelegramBot] Polling Error (${TelegramBotService._pollingErrorCount}/${TelegramBotService.POLLING_ERROR_THRESHOLD}): ${error.message}`);
            }

            if (TelegramBotService._pollingErrorCount === TelegramBotService.POLLING_ERROR_THRESHOLD) {
                Logger.error(`🛑 [TelegramBot] Polling 에러가 ${TelegramBotService.POLLING_ERROR_THRESHOLD}회 연속 발생하여 봇을 자동 중지합니다. 봇 토큰과 설정을 확인해 주세요.`);
                TelegramBotService.stop().catch(() => { });
            }
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
            // 메시지 수신 성공 시 에러 카운터 리셋
            TelegramBotService._pollingErrorCount = 0;

            // 2. 명령어 처리 (/help 등)
            if (text.startsWith('/')) {
                await this.handleCommand(chatId, text);
                return;
            }

            // 3. 일반 자연어 메시지 (Phase 2: AI 파싱 및 확인 대기)
            let loadingMsg = null;
            try {
                const agentContext = {
                    conversationId: `telegram:${String(chatId || '').trim()}`,
                    messageId: String(msg?.message_id || '').trim()
                };
                const deterministicEnvelope = tryParseDeterministicEnvelope(text, agentContext);
                if (!deterministicEnvelope) {
                    loadingMsg = await this.startLoadingIndicator(chatId);
                }

                const agentOutcome = await this.tryHandleAgentRequest(chatId, text, msg, {
                    preParsedEnvelope: deterministicEnvelope
                });
                if (agentOutcome.handled) {
                    await this.stopLoadingIndicator(chatId, loadingMsg);
                    return;
                }

                // AI 파싱 (Kuzu 영구 메모리 맥락 정보 포함)
                const Core = require('./core');

                // 1. Kuzu에서 과거 인사이트 및 최근 대화 히스토리 로드
                const userInsight = await KuzuDB.getUserInsight(chatId);
                const chatHistory = await KuzuDB.getHistory(chatId, 5); // 최근 5개 대화

                const context = {
                    last_topic: this.chatContext.get(chatId) || null,
                    user_insight: userInsight,
                    history: chatHistory
                };

                const parsedData = await Core.parseTelegramRequest(text, context);
                const { actions, meta } = parsedData;

                // For simple message recording, decide a primary intent
                let primaryIntent = 'UNKNOWN';
                if (actions && actions.length > 0) {
                    if (actions.some(a => a.action === 'register_topic' || a.action === 'publish_article')) primaryIntent = 'PUBLISH';
                    else if (actions.some(a => a.action === 'update_config')) primaryIntent = 'UPDATE_CONFIG';
                    else if (actions.some(a => a.action === 'run_job')) primaryIntent = 'RUN_JOB';
                    else if (actions.some(a => a.action === 'query_data')) primaryIntent = 'QUERY_DATA';
                }

                // 2. 메시지 기록 (추후 분석을 위해 인텐트 포함)
                await KuzuDB.recordMessage(chatId, text, primaryIntent);

                if (!actions || actions.length === 0) {
                    await this.stopLoadingIndicator(chatId, loadingMsg);
                    await this.callTelegramApi('sendMessage', [chatId, '😥 의도를 정확히 파악하지 못했습니다. 다시 말씀해 주시겠어요?'], { retries: 1, silent: true });
                    return;
                }

                const hasRegister = actions.some(a => a.action === 'register_topic');
                const hasPublish = actions.some(a => a.action === 'publish_article');
                const hasConfig = actions.some(a => a.action === 'update_config');
                const hasJob = actions.some(a => a.action === 'run_job');
                const hasQuery = actions.some(a => a.action === 'query_data');

                // 인텐트별 분기 처리 (Dispatcher)
                if (hasRegister || hasPublish) {
                    const confirmMsg = this.getPublishConfirmMessage(parsedData);
                    const keyboard = this.getPublishConfirmKeyboard(parsedData);

                    const sentMsg = await this.bot.sendMessage(chatId, confirmMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify({ inline_keyboard: keyboard })
                    });

                    // [Universal Memory] 에이전트 답변 기록
                    await KuzuDB.recordMessage(chatId, confirmMsg, 'AGENT_CONFIRM', 'AGENT').catch(() => { });

                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.stopLoadingIndicator(chatId, loadingMsg);
                } else if (hasConfig) {
                    // 설정 변경은 중요하므로 확인 절차 거침
                    const configAction = actions.find(a => a.action === 'update_config');
                    const updates = configAction.params?.config_updates || {};
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

                    // [Universal Memory] 에이전트 답변 기록
                    await KuzuDB.recordMessage(chatId, confirmMsg, 'AGENT_CONFIRM', 'AGENT').catch(() => { });

                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.stopLoadingIndicator(chatId, loadingMsg);

                } else if (hasJob) {
                    // 작업 실행 (예: 트렌드 수집)
                    const jobAction = actions.find(a => a.action === 'run_job');
                    const jobName = jobAction.params?.job_name || '알 수 없는 작업';
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

                    // [Universal Memory] 에이전트 답변 기록
                    await KuzuDB.recordMessage(chatId, confirmMsg, 'AGENT_CONFIRM', 'AGENT').catch(() => { });

                    this.pendingRequests.set(`${chatId}_${sentMsg.message_id}`, parsedData);
                    await this.stopLoadingIndicator(chatId, loadingMsg);

                } else if (hasQuery) {
                    // 데이터 조회는 즉시 실행
                    const queryAction = actions.find(a => a.action === 'query_data');
                    await this.stopLoadingIndicator(chatId, loadingMsg);
                    await this.handleQueryIntent(chatId, queryAction.params || {});
                }

	            } catch (err) {
	                Logger.error(`❌ [TelegramBot] 메시지 분석 실패: ${err.message}`);
	                await this.stopLoadingIndicator(chatId, loadingMsg);
	                await this.callTelegramApi('sendMessage', [chatId, `😥 요청 분석에 실패했습니다.\n\n사유: ${err.message}`], { retries: 1, silent: true });
	            }
	        };

        // 1:1 채팅 및 그룹방 메시지 수신
        this.bot.on('message', (msg) => {
            handleIncoming(msg).catch((error) => {
                Logger.error(`❌ [TelegramBot] message handler unhandled failure: ${error.message}`);
            });
        });
        // 채널 메시지 수신
        this.bot.on('channel_post', (msg) => {
            handleIncoming(msg).catch((error) => {
                Logger.error(`❌ [TelegramBot] channel_post handler unhandled failure: ${error.message}`);
            });
        });

        // 콜백(버튼 클릭) 쿼리 리스너
        this.bot.on('callback_query', async (query) => {
            const chatId = String(query.message.chat.id);
            const messageId = query.message.message_id;
            const data = query.data;

            if (allowedChatId && chatId !== allowedChatId) return;

            const requestKey = `${chatId}_${messageId}`;

            try {
                if (String(data || '').startsWith('agent_confirm:') || String(data || '').startsWith('agent_reject:')) {
                    const handled = await this.handleAgentCallback(chatId, messageId, data, query);
                    if (handled) return;
                }

                if (data === 'publish_cancel') {
                    this.pendingRequests.delete(requestKey);
                    await this.bot.editMessageText('❌ 발행 요청이 취소되었습니다.', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } else if (data === 'toggle_image' || data === 'toggle_extref' || data === 'toggle_autotrigger') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    if (!parsedData || !parsedData.actions) return;

                    const actions = parsedData.actions;
                    const registerAction = actions.find(a => a.action === 'register_topic');
                    if (!registerAction && data !== 'toggle_autotrigger') return;

                    const optionsObj = registerAction ? (registerAction.params.options || (registerAction.params.options = {})) : {};
                    const explicitParams = parsedData.meta?.explicit_params || [];

                    if (data === 'toggle_image') {
                        optionsObj.image_gen = optionsObj.image_gen === false ? true : false;
                        if (!explicitParams.includes('image_gen')) explicitParams.push('image_gen');
                    } else if (data === 'toggle_extref') {
                        optionsObj.external_reference = optionsObj.external_reference === false ? true : false;
                        if (!explicitParams.includes('external_reference')) explicitParams.push('external_reference');
                    } else if (data === 'toggle_autotrigger') {
                        const publishIdx = actions.findIndex(a => a.action === 'publish_article');
                        if (publishIdx >= 0) {
                            actions.splice(publishIdx, 1);
                        } else {
                            actions.push({ action: 'publish_article', params: { target: 'all' } });
                        }
                    }

                    if (!parsedData.meta) parsedData.meta = {};
                    parsedData.meta.explicit_params = explicitParams;

                    const newMsg = this.getPublishConfirmMessage(parsedData);
                    const newKeyboard = this.getPublishConfirmKeyboard(parsedData);

                    await this.bot.editMessageText(newMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify({ inline_keyboard: newKeyboard })
                    });
                } else if (data === 'publish_confirm') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    if (!parsedData || !parsedData.actions) {
                        await this.bot.answerCallbackQuery(query.id, { text: '세션이 만료되었거나 이미 처리된 요청입니다.', show_alert: true });
                        return;
                    }

                    const actions = parsedData.actions;
                    const registerAction = actions.find(a => a.action === 'register_topic');
                    const hasPublish = actions.some(a => a.action === 'publish_article');

                    const Utils = require('./utils');
                    const axios = require('axios');
                    const CONFIG = require('./config-loader');

                    let addedRowIndices = [];

                    if (registerAction) {
                        const newTopics = [];
                        const pData = registerAction.params || {};
                        // 플랫폼별로 분리해서 행 생성
                        const platforms = pData.platforms || ['naver'];
                        for (const p of platforms) {
                            const isWP = p.toLowerCase().includes('wordpress');
                            const targetPlatform = isWP ? 'wordpress' : 'naver';

                            // 플랫폼별 카테고리 결정 (naver_category/wordpress_category 우선, 없으면 공통 category)
                            const platformCategory = isWP
                                ? (pData.options?.wordpress_category || pData.options?.category || '')
                                : (pData.options?.naver_category || pData.options?.category || '');

                            newTopics.push({
                                subject: pData.theme || '주제 없음',
                                keywords: pData.keywords || [],
                                category: platformCategory,
                                options: {
                                    ...(pData.options || {}),
                                    platforms: [targetPlatform]
                                },
                                source: 'telegram',
                                chatId: chatId // [Universal Memory] Kuzu 전파용
                            });
                        }

                        // SpreadSheet 에 등록 ('발행 준비 완료' 상태로)
                        // (Utils 내부에서 Kuzu 에도 자동으로 기록함)
                        const appendRes = await Utils.appendGoogleSheetTopics(newTopics, { defaultStatus: '발행 준비 완료' });
                        addedRowIndices = appendRes?.rowIndices || [];

                        if (pData.theme) {
                            this.chatContext.set(chatId, pData.theme);
                            Logger.info(`💾 [TelegramBot] 맥락 저장 완료 (${chatId}): ${pData.theme}`);

                            // [Insight] 신규 데이터가 쌓였으므로 인사이트 생성 시도 (백그라운드)
                            const InsightEngine = require('./insight-engine');
                            InsightEngine.generateInsight(chatId).catch(() => { });
                        }
                    }

                    this.pendingRequests.delete(requestKey);

                    await this.bot.editMessageText(
                        hasPublish ? this.getRandomMessage('topic_added') : '✅ 글감이 시트 대기열에 성공적으로 등록되었습니다!',
                        {
                            chat_id: chatId,
                            message_id: messageId
                        }
                    );

                    if (hasPublish) {
                        try {
                            const port = CONFIG.UI_SERVER_PORT || 4577;

                            // 현재 상태 확인 (다른 발행이 돌고 있는지 체크)
                            const statusRes = await axios.get(`http://127.0.0.1:${port}/api/v1/auto/status`);
                            const isRunning = statusRes.data?.data?.running === true;

                            if (isRunning) {
                                await this.bot.sendMessage(chatId, this.getRandomMessage('busy'));
                            } else {
                                // 발행 트리거
                                await this.bot.sendMessage(chatId, this.getRandomMessage('publishing_start'));
                                // 백그라운드로 던짐 (await 하지 않음)
                                const postData = {
                                    settingsOverrides: {
                                        PUBLISH_AUTO_HEADLESS: true // 텔레그램 요청은 가급적 Headless 모드로 조용히 실행
                                    }
                                };
                                if (addedRowIndices.length > 0) {
                                    postData.targetRowIndices = addedRowIndices;
                                }
                                axios.post(`http://127.0.0.1:${port}/api/v1/auto/publish/run`, postData).catch(e => {
                                    Logger.error(`❌ [TelegramBot] 발행 트리거 API 호출 실패: ${e.message}`);
                                });
                            }
                        } catch (apiErr) {
                            Logger.error(`❌ [TelegramBot] 상태 확인 또는 발행 루틴 호출 실패: ${apiErr.message}`);
                        }
                    }
                } else if (data === 'config_confirm') {
                    const parsedData = this.pendingRequests.get(requestKey);
                    const configAction = parsedData?.actions?.find(a => a.action === 'update_config');
                    if (!parsedData || !configAction || !configAction.params?.config_updates) {
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
                await this.callTelegramApi('answerCallbackQuery', [query.id, { text: '처리 중 오류가 발생했습니다.', show_alert: true }], { retries: 0, silent: true });
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
        const params = data.query_params || {};
        const axios = require('axios');
        const CONFIG = require('./config-loader');
        const port = CONFIG.UI_SERVER_PORT || 4577;
        // Kuzu Service를 사용하여 데이터 조회

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

            } else if (queryType === 'topics') {
                const results = await KuzuDB.getTopicSummary(chatId, params);
                if (results.length === 0) {
                    await this.bot.sendMessage(chatId, "📝 아직 기록된 토픽이 없습니다.");
                } else {
                    let msg = `📝 *최근 등록된 토픽 (${results.length}건)*\n\n`;
                    results.forEach(t => {
                        msg += `• [${t.category || '일반'}] *${t.subject}*\n  (소스: ${t.source})\n`;
                    });
                    await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }

            } else if (queryType === 'shopping') {
                const results = await KuzuDB.getShoppingSummary(chatId, params);
                if (results.length === 0) {
                    await this.bot.sendMessage(chatId, "🛍️ 등록된 쇼핑 아이템이 없습니다.");
                } else {
                    let msg = `🛍️ *최근 쇼핑 아이템 (${results.length}건)*\n\n`;
                    results.forEach(s => {
                        msg += `• *${s.name}*\n  가격: ${s.price} | 몰: ${s.mall}\n`;
                    });
                    await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }

            } else if (queryType === 'stats') {
                const s = await KuzuDB.getGlobalStats();
                const msg = `📈 *지능형 메모리 통계*\n\n` +
                    `• 전체 사용자: ${s.users}명\n` +
                    `• 총 대화량: ${s.messages}건\n` +
                    `• 등록된 토픽: ${s.topics}건\n` +
                    `• 쇼핑 아이템: ${s.shopping}건\n\n` +
                    `_모든 데이터는 Kuzu Graph DB에 안전하게 기록되고 있습니다._`;
                await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });

            } else if (queryType === 'insight') {
                const insight = await KuzuDB.getUserInsight(chatId);
                if (!insight) {
                    await this.bot.sendMessage(chatId, "🤔 아직 분석된 성향 정보가 부족합니다. 대화를 조금 더 나누어 볼까요?");
                } else {
                    const msg = `✨ *에이전트가 파악한 사용자 인사이트*\n\n"${insight}"`;
                    await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }

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

    static async stop() {
        if (this.bot) {
            try {
                await this.bot.stopPolling();
                this.bot = null;
                this.isInitialized = false;
                Logger.info('🛑 [TelegramBot] 텔레그램 수신 봇 데몬을 중지했습니다.');
            } catch (err) {
                Logger.error(`❌ [TelegramBot] 봇 중지 실패: ${err.message}`);
                // 에러가 발생해도 상태는 초기화
                this.bot = null;
                this.isInitialized = false;
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

    /**
     * 발행 정보 메시지 생성 (미지정 설정 하이라이트 포함)
     */
    static getPublishConfirmMessage(parsedData) {
        const actions = parsedData.actions || [];
        const meta = parsedData.meta || {};
        const explicitParams = meta.explicit_params || [];

        const registerAction = actions.find(a => a.action === 'register_topic');
        const data = registerAction ? (registerAction.params || {}) : {};
        const optionsObj = data.options || {};
        const hasPublish = actions.some(a => a.action === 'publish_article');

        let platformsStr = (data.platforms || ['naver']).map(p => p.toLowerCase() === 'wordpress' ? '워드프레스' : '네이버 블로그').join(', ');
        const imgGenVal = optionsObj.image_gen !== false;
        const extRefVal = optionsObj.external_reference !== false;

        let imgGenIcon = imgGenVal ? '✅' : '❌';
        let extRefIcon = extRefVal ? '✅' : '❌';
        let publishIcon = hasPublish ? '✅' : '❌';

        // 사용자가 명시하지 않은 경우 힌트 추가
        const imgHint = explicitParams.includes('image_gen') ? '' : ' 💡 _(기본 설정)_';
        const extRefHint = explicitParams.includes('external_reference') ? '' : ' 💡 _(기본 설정)_';

        let confirmMsg = `✨ *분석 완료!* 다음 조건으로 준비할까요?\n\n` +
            `🎯 *주제:* ${this.escapeMarkdown(data.theme || '주제 없음')}\n` +
            `🔑 *키워드:* ${(data.keywords || []).map(k => this.escapeMarkdown(k)).join(', ') || '없음'}\n` +
            `🏷️ *적용 대상:* ${platformsStr}\n` +
            `🖼️ *이미지 생성:* ${imgGenIcon}${imgHint}\n` +
            `🔍 *외부 자료 참고:* ${extRefIcon}${extRefHint}\n` +
            `🚀 *자동 발행:* ${publishIcon}\n`;

        if (optionsObj.schedule_date) confirmMsg += `⏰ *예약 일시:* ${optionsObj.schedule_date}\n`;
        if (optionsObj.instruction) confirmMsg += `📝 *추가 지시:* ${this.escapeMarkdown(optionsObj.instruction)}\n`;
        if (optionsObj.category) confirmMsg += `📁 *카테고리:* ${this.escapeMarkdown(optionsObj.category)}\n`;
        if (optionsObj.post_status === 'draft') confirmMsg += `📌 *발행 옵션:* 임시저장(Draft)\n`;

        return confirmMsg;
    }

    /**
     * 발행 컨펌용 인라인 키보드 생성 (토글 버튼 포함)
     */
    static getPublishConfirmKeyboard(parsedData) {
        const actions = parsedData.actions || [];
        const registerAction = actions.find(a => a.action === 'register_topic');
        const optionsObj = registerAction ? (registerAction.params?.options || {}) : {};
        const hasPublish = actions.some(a => a.action === 'publish_article');

        const imgGenVal = optionsObj.image_gen !== false;
        const extRefVal = optionsObj.external_reference !== false;

        return [
            [
                { text: `🖼️ 이미지: ${imgGenVal ? '✅' : '❌'}`, callback_data: 'toggle_image' },
                { text: `🔍 외부참고: ${extRefVal ? '✅' : '❌'}`, callback_data: 'toggle_extref' }
            ],
            [
                { text: `🚀 자동 발행: ${hasPublish ? '✅' : '❌'}`, callback_data: 'toggle_autotrigger' }
            ],
            [{ text: `✅ 네, 이대로 ${hasPublish ? '진행해 주세요' : '등록해 주세요'}`, callback_data: 'publish_confirm' }],
            [{ text: '❌ 아뇨, 취소할게요', callback_data: 'publish_cancel' }]
        ];
    }
}

module.exports = TelegramBotService;
