const { TelegramBot } = require('node-telegram-bot-api');
const Logger = require('../../../utilities/logging/logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createAgentRuntime } = require('../../../host/agent/runtime');
const { ConfirmationStore } = require('../../storage/confirmations/confirmation-store');
const { createCapabilityRuntime } = require('../../../composition/capability-runtime');
const { createKnowledgeRuntime } = require('../../../composition/knowledge-runtime');
const { createMemoryRetrievalService } = require('../../../services/memory/retrieval-service');
const { routeTelegramMessage, tryParseDeterministicEnvelope } = require('./agent-parser');
const TelegramAgentRenderer = require('./agent-renderer');
const { getAgentEventStore } = require('../../../host/memory/runtime');
const { recordRecommendationFeedback } = require('../../../services/recommendations/adapters/recommendation-feedback-adapter');
const {
    calculateTelegramPollingBackoffMs,
    describeTelegramError,
    formatTelegramDiagnostic
} = require('./network-policy');

function summarizeAgentActionIds(actions = []) {
    return (Array.isArray(actions) ? actions : [])
        .map(action => String(action?.action_id || action?.capability_id || [action?.domain, action?.name].filter(Boolean).join('.') || '').trim())
        .filter(Boolean)
        .join(',') || 'none';
}

function summarizeAgentResults(results = []) {
    return (Array.isArray(results) ? results : [])
        .map(item => `${String(item?.capability_id || item?.action_id || 'unknown')}:${item?.result?.success === false ? 'failed' : 'ok'}`)
        .join(',') || 'none';
}

function getSafeAgentErrorCode(error) {
    return String(error?.code || error?.name || 'UNKNOWN').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'UNKNOWN';
}

class TelegramBotService {
    static CONFIG = {};
    static GoogleSheets = null;
    static License = null;
    static bot = null;
    static isInitialized = false;
    static agentRuntime = null;
    static agentEventStore = null;
    static agentRetrieval = null;
    static agentCapabilityRegistry = null;
    static runtimeDependencies = Object.freeze({});
    static _pollingErrorCount = 0;
    static _pollingErrorWindowStart = 0;
    static POLLING_ERROR_THRESHOLD = 8;
    static POLLING_BASE_BACKOFF_MS = 1000;
    static POLLING_MAX_BACKOFF_MS = 30000;
    static _lastPollingError = null;
    static _stoppedReason = '';

    static calculatePollingBackoffMs(errorCount) {
        return calculateTelegramPollingBackoffMs(errorCount, {
            baseMs: this.POLLING_BASE_BACKOFF_MS,
            maxMs: this.POLLING_MAX_BACKOFF_MS
        });
    }

    static recordPollingSuccess() {
        if (this._pollingErrorCount > 0) {
            Logger.info(`✅ [TelegramBot] Polling 연결 복구 (이전 연속 오류=${this._pollingErrorCount})`);
        }
        this._pollingErrorCount = 0;
        this._pollingErrorWindowStart = 0;
        this._lastPollingError = null;
        this._stoppedReason = '';
        if (this.bot?._polling?.options) {
            this.bot._polling.options.interval = this.POLLING_BASE_BACKOFF_MS;
        }
    }

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
                    const details = describeTelegramError(error, { botToken: this.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN });
                    Logger.warn(`⚠️ [TelegramBot] ${methodName} 실패: ${formatTelegramDiagnostic(details)}`);
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

    static configureRuntimeDependencies(dependencies = {}) {
        if (this.agentRuntime) {
            throw new Error('Telegram runtime dependencies must be configured before the Agent runtime starts.');
        }
        this.runtimeDependencies = Object.freeze({ ...dependencies });
    }

    static init() {
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


        const enabled = this.CONFIG.NOTIFY_TELEGRAM_INBOUND_ENABLED;
        const botToken = this.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
        const chatId = String(this.CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim();

        if (!enabled || !botToken) {
            Logger.info('ℹ️ [TelegramBot] 텔레그램 알림이 비활성화되어 있거나 설정이 누락되어 수신 봇을 시작하지 않습니다.');
            return;
        }

        try {
            this._pollingErrorCount = 0;
            this._pollingErrorWindowStart = 0;
            this._lastPollingError = null;
            this._stoppedReason = '';
            this.ensureAgentRuntime();

            if (this.agentEventStore && typeof this.agentEventStore.initialize === 'function') {
                this.agentEventStore.initialize().catch(err => {
                    Logger.error(`❌ [TelegramBot] Agent EventStore 초기화 실패: ${err.message}`);
                });
            }

            // Telegram은 느린 IPv4와 사용할 수 없는 IPv6 조합에서 Node의
            // family 자동 선택이 실패할 수 있으므로 수신 polling을 IPv4로 고정합니다.
            this.bot = new TelegramBot(botToken, {
                polling: {
                    autoStart: false,
                    interval: this.POLLING_BASE_BACKOFF_MS,
                    params: { timeout: 10 }
                },
                request: { family: 4 }
            });
            const getUpdates = this.bot.getUpdates.bind(this.bot);
            this.bot.getUpdates = async (...args) => {
                const updates = await getUpdates(...args);
                this.recordPollingSuccess();
                return updates;
            };
            this.isInitialized = true;
            this.setupListeners(chatId);
            void this.bot.startPolling().catch((error) => {
                const details = describeTelegramError(error, { botToken });
                Logger.error(`❌ [TelegramBot] Polling 시작 실패: ${formatTelegramDiagnostic(details)}`);
            });
            Logger.info('✅ [TelegramBot] 텔레그램 수신 봇 데몬이 성공적으로 시작되었습니다. (Long Polling, IPv4 호환)');
        } catch (error) {
            const details = describeTelegramError(error, { botToken });
            Logger.error(`❌ [TelegramBot] 텔레그램 수신 봇 시작 실패: ${formatTelegramDiagnostic(details)}`);
        }
    }

    static ensureAgentRuntime() {
        if (this.agentRuntime) return this.agentRuntime;

        this.agentEventStore = getAgentEventStore();

        const dependencies = this.runtimeDependencies || {};
        const resolveWritableConfigPath = dependencies.resolveWritableConfigPath
            || (() => this.CONFIG.CONFIG_SOURCE_PATH || this.CONFIG.PATHS?.configFile || path.join(process.cwd(), 'config', 'config.json'));
        const buildDefaultConfigTemplate = dependencies.buildDefaultConfigTemplate || (() => '{}');
        const syncAutoRunnerWithConfig = dependencies.syncAutoRunnerWithConfig || (() => { });
        const resolveNaverAutoCategoryCatalog = dependencies.resolveNaverAutoCategoryCatalog || null;

        const License = TelegramBotService.License;
        if (!License) throw new Error('Telegram runtime requires an injected licensing port.');
        const CONFIG = this.CONFIG;
        const knowledgeRuntime = createKnowledgeRuntime({ CONFIG, License, Logger, axios });
        const capabilityRegistry = createCapabilityRuntime({
            ...knowledgeRuntime,
            fs,
            path,
            axios,
            Logger,
            CONFIG,
            License,
            GoogleSheets: this.GoogleSheets,
            eventStore: this.agentEventStore,
            resolveWritableConfigPath,
            buildDefaultConfigTemplate,
            syncAutoRunnerWithConfig,
            resolveNaverAutoCategoryCatalog,
            modelConfiguration: dependencies.modelConfiguration,
            agentActionProviders: dependencies.agentActionProviders
        });

        this.agentRuntime = createAgentRuntime({
            capabilityRegistry,
            confirmationStore: new ConfirmationStore(),
            eventStore: this.agentEventStore,
            CONFIG,
            Logger
        });
        this.agentCapabilityRegistry = capabilityRegistry;
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

    static async handleRoutedTelegramMessage(chatId, text, msg, options = {}) {
        const runtime = this.ensureAgentRuntime();
        const baseContext = this.buildAgentContext(chatId, msg);
        baseContext.messageId = String(msg?.message_id || '').trim();

        const earlyDeterministicEnvelope = options.preParsedEnvelope || tryParseDeterministicEnvelope(text, {
            conversationId: baseContext.conversation.id,
            messageId: baseContext.messageId
        });

        if (earlyDeterministicEnvelope?.actions?.length === 1
            && String(earlyDeterministicEnvelope.actions[0]?.domain || '').trim() === 'agent.meta') {
            const actionIds = summarizeAgentActionIds(earlyDeterministicEnvelope.actions);
            const outcome = await runtime.handleEnvelope(earlyDeterministicEnvelope, baseContext);
            Logger.info(`🧭 [TelegramAgent] deterministic action=${actionIds} status=${outcome.status || (outcome.ok ? 'completed' : 'rejected')}`);
            if (!outcome.ok) {
                await this.bot.sendMessage(chatId, `❌ 요청을 처리하지 못했습니다.\n\n사유: ${(outcome.errors || []).join('\n')}`);
                return { handled: true };
            }

            if (outcome.status === 'completed') {
                await this.bot.sendMessage(chatId, TelegramAgentRenderer.formatExecutionMessage(outcome.results), {
                    parse_mode: 'Markdown'
                });
                return { handled: true };
            }
        }

        const context = this.buildAgentContext(chatId, msg);
        context.messageId = String(msg?.message_id || '').trim();
        const retrievalStartedAt = Date.now();
        context.memory = await this.agentRetrieval.buildContextPacket({
            conversationId: context.conversation.id,
            userId: context.user.id,
            ownerUserId: this.agentEventStore?.getLocalOwnerIdentity?.()?.owner_user_id || '',
            limit: 8
        });
        Logger.info(`⏱️ [TelegramAgent] retrieval ${Date.now() - retrievalStartedAt}ms`);

        const parserStartedAt = Date.now();
        const envelope = earlyDeterministicEnvelope || await routeTelegramMessage(text, {
            conversationId: context.conversation.id,
            messageId: context.messageId,
            memory: context.memory,
            modelCaller: this.runtimeDependencies?.generateChatText,
            capabilityRegistry: this.agentCapabilityRegistry
        });
        Logger.info(`⏱️ [TelegramRouter] ${Date.now() - parserStartedAt}ms`);
        Logger.info(`🧭 [TelegramAgent] route=${String(envelope?.route || 'unknown')} actions=${summarizeAgentActionIds(envelope?.actions)}`);
        const parserNote = [
            String(envelope?.reply?.text || '').trim(),
            String(envelope?.reply?.recommendation || '').trim()
                ? `💡 추천: ${String(envelope.reply.recommendation).trim()}`
                : ''
        ].filter(Boolean).join('\n\n').slice(0, 4000);

        if (envelope?.route === 'reply' || envelope?.route === 'unsupported') {
            const replyText = String(envelope.reply?.text || '').trim()
                || '요청을 정확히 처리할 방법을 찾지 못했어요. 원하신 결과를 조금 더 설명해 주시거나, 사용 가능한 기능을 물어봐 주세요.';
            const response = (parserNote || replyText).slice(0, 4000);
            await this.bot.sendMessage(chatId, response);
            if (typeof this.agentEventStore?.recordInteractionMessage === 'function') {
                await this.agentEventStore.recordInteractionMessage(
                    context,
                    response,
                    `CHAT_${envelope.route.toUpperCase()}`,
                    'AGENT'
                ).catch(() => { });
            }
            return { handled: true };
        }


        if (!Array.isArray(envelope?.actions) || envelope.actions.length === 0) {
            await this.bot.sendMessage(chatId, '요청을 처리할 방법을 찾지 못했어요. 원하신 결과를 조금 더 설명해 주시겠어요?');
            return { handled: true };
        }

        const runtimeStartedAt = Date.now();
        let outcome;
        try {
            outcome = await runtime.handleEnvelope(envelope, context);
        } catch (error) {
            Logger.error(`❌ [TelegramAgent] execution threw actions=${summarizeAgentActionIds(envelope.actions)} code=${getSafeAgentErrorCode(error)}`);
            throw error;
        }
        const plannedActionIds = summarizeAgentActionIds(outcome.plan?.steps?.map(step => step.action) || envelope.actions);
        Logger.info(`⏱️ [TelegramAgent] runtime ${Date.now() - runtimeStartedAt}ms status=${outcome.status || (outcome.ok ? 'completed' : 'rejected')} actions=${summarizeAgentResults(outcome.results)}`);
        if (!outcome.ok) {
            Logger.warn(`⚠️ [TelegramAgent] runtime rejected actions=${plannedActionIds} error_count=${(outcome.errors || []).length}`);
            await this.bot.sendMessage(chatId, `❌ 요청을 처리하지 못했습니다.\n\n사유: ${(outcome.errors || []).join('\n')}`);
            return { handled: true };
        }

        if (parserNote) await this.bot.sendMessage(chatId, parserNote);

        if (outcome.status === 'confirmation_required') {
            const confirmationId = outcome.confirmation?.id;
            Logger.info(`🛂 [TelegramAgent] confirmation requested id=${String(confirmationId || 'unknown')} actions=${plannedActionIds}`);
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
            const recommendationKeyboard = TelegramAgentRenderer.buildRecommendationKeyboard(outcome.results);
            const artifactKeyboard = TelegramAgentRenderer.buildArtifactKeyboard(outcome.results);
            const options = {
                parse_mode: 'Markdown'
            };
            const inlineKeyboard = [...recommendationKeyboard, ...artifactKeyboard];
            if (inlineKeyboard.length > 0) {
                options.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
            }
            const executionMessage = TelegramAgentRenderer.formatExecutionMessage(outcome.results);
            await this.bot.sendMessage(chatId, executionMessage, options);
            if (typeof this.agentEventStore?.recordInteractionMessage === 'function') {
                await this.agentEventStore.recordInteractionMessage(
                    context,
                    outcome.results.map((item) => String(item?.result?.message || '')).filter(Boolean).join('\n\n') || executionMessage,
                    'AGENT_RESPONSE',
                    'AGENT'
                ).catch(() => { });
            }
            return { handled: true };
        }

        await this.bot.sendMessage(chatId, '요청을 연결할 수 있는 기능을 찾지 못했습니다. /help에서 현재 사용할 수 있는 기능을 확인해 주세요.');
        return { handled: true };
    }

    static async handleAgentCallback(chatId, messageId, data, query) {
        const runtime = this.ensureAgentRuntime();
        const parts = String(data || '').split(':');
        const verb = parts[0];
        const targetId = parts[parts.length - 1];
        if (!targetId) return false;

        if (verb === 'rec_fb') {
            const feedback = parts[1] === 'h' ? 'helpful' : parts[1] === 'n' ? 'not_helpful' : '';
            if (!feedback) return false;
            const owner = this.agentEventStore?.getLocalOwnerIdentity?.() || {};
            let recorded = false;
            try {
                const result = await recordRecommendationFeedback({
                    eventStore: this.agentEventStore,
                    owner_user_id: owner.owner_user_id,
                    recommendation_id: targetId,
                    feedback,
                    operation_id: String(query?.id || `telegram_${messageId}`),
                    occurred_at: new Date().toISOString(),
                    source: 'telegram'
                });
                recorded = result.recorded === true;
            } catch (_error) { }
            await this.bot.answerCallbackQuery(query.id, {
                text: !recorded
                    ? '피드백을 기록하지 못했습니다. 잠시 후 다시 시도해 주세요.'
                    : feedback === 'helpful'
                        ? '도움됨으로 기록했습니다.'
                        : '이 추천을 숨기고 별로로 기록했습니다.'
            });
            return true;
        }

        if (verb === 'artifact_feedback') {
            const context = this.buildAgentContext(chatId, query?.message || {});
            context.messageId = String(messageId || '').trim();
            const feedback = String(parts[1] || '').trim();
            const eventType = feedback === 'helpful' ? 'artifact.helpful' : 'artifact.not_helpful';
            await this.agentEventStore.appendEvent({
                id: query?.id ? `telegram_feedback_${String(query.id).trim()}` : undefined,
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

            const feedbackTarget = typeof this.agentEventStore.getFeedbackTarget === 'function'
                ? await this.agentEventStore.getFeedbackTarget('artifact', targetId).catch(() => null)
                : null;
            if (feedbackTarget?.domain) {
                await this.agentEventStore.recordActivityLifecycle({
                    domain: feedbackTarget.domain,
                    stage: 'feedback',
                    subject: feedbackTarget.subject,
                    source: 'telegram-artifact-feedback',
                    entity_ref: feedbackTarget.entity_ref,
                    evidence_id: `telegram-feedback:${String(query?.id || `${messageId}:${targetId}:${feedback}`).trim()}`,
                    provenance: {
                        channel: context.channel,
                        actor_type: 'user',
                        actor_id: context.user.id,
                        conversation_id: context.conversation.id,
                        message_id: context.messageId,
                        request_id: String(query?.id || '').trim()
                    },
                    metadata: {
                        feedback,
                        artifact_type: feedbackTarget.artifact_type,
                        target_kind: 'artifact',
                        ...(feedbackTarget.recommendation ? { recommendation: feedbackTarget.recommendation } : {})
                    }
                }).catch(() => { });
            }

            await this.bot.answerCallbackQuery(query.id, {
                text: feedback === 'helpful' ? '도움됨으로 기록했습니다.' : '별로로 기록했습니다.'
            });
            return true;
        }

        const context = this.buildAgentContext(chatId, query?.message || {});
        context.messageId = String(messageId || '').trim();

        const decision = verb === 'agent_confirm' ? 'approve' : 'reject';
        const confirmation = runtime.confirmationStore.get(targetId);
        const pendingActions = confirmation?.plan?.steps?.map(step => step.action)
            || confirmation?.actions
            || [];
        const actionIds = summarizeAgentActionIds(pendingActions);
        const confirmationStartedAt = Date.now();
        Logger.info(`🛂 [TelegramAgent] confirmation decision=${decision} id=${targetId} actions=${actionIds}`);
        let outcome;
        try {
            outcome = await runtime.handleConfirmationDecision({ confirmationId: targetId, decision }, context);
        } catch (error) {
            Logger.error(`❌ [TelegramAgent] confirmed execution threw actions=${actionIds} code=${getSafeAgentErrorCode(error)}`);
            throw error;
        }
        Logger.info(`⏱️ [TelegramAgent] confirmation ${Date.now() - confirmationStartedAt}ms status=${outcome.status || (outcome.ok ? 'completed' : 'rejected')} actions=${summarizeAgentResults(outcome.results)}`);

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
            const executionMessage = TelegramAgentRenderer.formatExecutionMessage(outcome.results);
            await this.bot.editMessageText(executionMessage, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            if (typeof this.agentEventStore?.recordInteractionMessage === 'function') {
                await this.agentEventStore.recordInteractionMessage(
                    context,
                    outcome.results.map((item) => String(item?.result?.message || '')).filter(Boolean).join('\n\n') || executionMessage,
                    'AGENT_RESPONSE',
                    'AGENT'
                ).catch(() => { });
            }
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
            if (!TelegramBotService._pollingErrorWindowStart) TelegramBotService._pollingErrorWindowStart = now;
            TelegramBotService._pollingErrorCount++;
            const details = describeTelegramError(error, { botToken: TelegramBotService.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN });
            const retryDelayMs = TelegramBotService.calculatePollingBackoffMs(TelegramBotService._pollingErrorCount);
            TelegramBotService._lastPollingError = {
                category: details.category,
                code: details.code,
                message: details.userMessage,
                occurredAt: new Date(now).toISOString()
            };
            if (TelegramBotService.bot?._polling?.options) {
                TelegramBotService.bot._polling.options.interval = retryDelayMs;
            }

            if (TelegramBotService._pollingErrorCount <= TelegramBotService.POLLING_ERROR_THRESHOLD) {
                Logger.error(
                    `❌ [TelegramBot] Polling 오류 (${TelegramBotService._pollingErrorCount}/${TelegramBotService.POLLING_ERROR_THRESHOLD}, `
                    + `다음 재시도=${Math.round(retryDelayMs / 1000)}초): ${formatTelegramDiagnostic(details)}`
                );
            }

            if (TelegramBotService._pollingErrorCount === TelegramBotService.POLLING_ERROR_THRESHOLD) {
                TelegramBotService._stoppedReason = details.userMessage;
                Logger.error(`🛑 [TelegramBot] 지속적인 Polling 오류로 수신을 자동 중지합니다: ${details.userMessage}`);
                TelegramBotService.stop({ reason: details.userMessage }).catch(() => { });
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
            TelegramBotService.recordPollingSuccess();

            const incomingContext = this.buildAgentContext(chatId, msg);
            if (this.agentEventStore && typeof this.agentEventStore.recordInteractionMessage === 'function') {
                await this.agentEventStore.recordInteractionMessage(
                    incomingContext,
                    text,
                    text.startsWith('/') ? 'COMMAND' : 'UNKNOWN',
                    'USER'
                ).catch(() => { });
            }

            // 2. 명령어 처리 (/help 등)
            if (text.startsWith('/')) {
                await this.handleCommand(chatId, text, msg);
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

                await this.handleRoutedTelegramMessage(chatId, text, msg, {
                    preParsedEnvelope: deterministicEnvelope
                });
                await this.stopLoadingIndicator(chatId, loadingMsg);
                return;

	            } catch (err) {
	                Logger.error(`❌ [TelegramBot] 메시지 분석 실패: ${err.message}`);
	                await this.stopLoadingIndicator(chatId, loadingMsg);
	                await this.callTelegramApi('sendMessage', [chatId, '😥 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'], { retries: 1, silent: true });
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

            try {
                if (String(data || '').startsWith('agent_confirm:') || String(data || '').startsWith('agent_reject:')) {
                    const handled = await this.handleAgentCallback(chatId, messageId, data, query);
                    if (handled) return;
                }


                // 버튼 로딩 해제
                await this.bot.answerCallbackQuery(query.id);
            } catch (err) {
                Logger.error(`❌ [TelegramBot] 콜백 처리 실패: ${err.message}`);
                await this.callTelegramApi('answerCallbackQuery', [query.id, { text: '처리 중 오류가 발생했습니다.', show_alert: true }], { retries: 0, silent: true });
            }
        });
    }



    static async handleCommand(chatId, commandText, msg = {}) {
        const cmd = commandText.split(' ')[0].split('@')[0].toLowerCase();

        try {
            if (cmd === '/start' || cmd === '/help') {
                const context = this.buildAgentContext(chatId, msg);
                const preParsedEnvelope = tryParseDeterministicEnvelope(commandText, {
                    conversationId: context.conversation.id,
                    messageId: String(msg?.message_id || '').trim()
                });
                await this.handleRoutedTelegramMessage(chatId, commandText, msg, { preParsedEnvelope });
            } else {
                await this.bot.sendMessage(chatId, `알 수 없는 명령어입니다: ${cmd}\n/help 를 입력해보세요.`);
            }
        } catch (err) {
            Logger.error(`❌ [TelegramBot] 명령 응답 실패: ${err.message}`);
        }
    }

    /**
     * [Notify] 외부 모듈에서 알림 메시지를 보낼 때 사용 (Config의 ChatId 자동 사용)
     */
    static async sendNotification(text, options = {}) {
        const enabled = this.CONFIG.NOTIFY_TELEGRAM_ENABLED;
        const botToken = this.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
        const chatId = this.CONFIG.NOTIFY_TELEGRAM_CHAT_ID;

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
            const details = describeTelegramError(err, { botToken: this.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN });
            Logger.error(`❌ [TelegramBot] 알림 전송 실패: ${formatTelegramDiagnostic(details)}`);
            return false;
        }
    }

    static getStatus() {
        const enabled = this.CONFIG.NOTIFY_TELEGRAM_INBOUND_ENABLED === true;
        const botToken = String(this.CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim();
        const chatId = String(this.CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim();
        return {
            enabled,
            configured: Boolean(botToken && chatId),
            running: Boolean(this.isInitialized && this.bot),
            hasBotToken: Boolean(botToken),
            hasChatId: Boolean(chatId),
            lastErrorCategory: String(this._lastPollingError?.category || ''),
            lastErrorMessage: String(this._lastPollingError?.message || this._stoppedReason || ''),
            lastErrorAt: String(this._lastPollingError?.occurredAt || '')
        };
    }

    static async stop(options = {}) {
        if (options.reason) this._stoppedReason = String(options.reason);
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


}

module.exports = TelegramBotService;
