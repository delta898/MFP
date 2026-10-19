'use strict';

const fs = require('fs');
const axios = require('axios');
const CONFIG = require('../../../config-loader');
const Logger = require('../../../utilities/logging/logger');
const GoogleOAuth = require('../../google/auth/google-oauth');
const {
    formatSheetImageModeValue,
    mergeShoppingSheetOptions,
    mergeTopicSheetOptions,
    parseSheetImageModeValue,
    resolveShoppingSheetState,
    resolveTopicSheetState,
    stringifySheetOptionsValue
} = require('./publish-options');
const {
    SNS_SHEET_NAME,
    SNS_SHEET_HEADERS,
    buildSnsStatusValidationRequest
} = require('../../../services/sns/sheet-schema');
const {
    CARD_NEWS_SHEET_NAME,
    CARD_NEWS_SHEET_HEADERS,
    buildCardNewsStatusValidationRequests
} = require('../card-news/ledger-sheet-schema');
const { buildTopicRowMoveRequest } = require('./topic-queue-order');
const { getAgentEventStore } = require('../../../host/memory/runtime');

module.exports = { fs, axios, CONFIG, Logger, GoogleOAuth, formatSheetImageModeValue, mergeShoppingSheetOptions, mergeTopicSheetOptions, parseSheetImageModeValue, resolveShoppingSheetState, resolveTopicSheetState, stringifySheetOptionsValue, SNS_SHEET_NAME, SNS_SHEET_HEADERS, buildSnsStatusValidationRequest, CARD_NEWS_SHEET_NAME, CARD_NEWS_SHEET_HEADERS, buildCardNewsStatusValidationRequests, buildTopicRowMoveRequest, getAgentEventStore };
