'use strict';

const fs = require('fs');
const axios = require('axios');
const Logger = require('../../../utilities/logging/logger');
const GoogleOAuth = require('../../google/auth/google-oauth');
let runtimeConfig = {};
const CONFIG = new Proxy({}, {
    get(_target, property) { return runtimeConfig[property]; },
    set(_target, property, value) { runtimeConfig[property] = value; return true; },
    has(_target, property) { return property in runtimeConfig; }
});

function configureGoogleSheetsRuntime({ config } = {}) {
    if (!config || typeof config !== 'object') throw new TypeError('Google Sheets adapter requires Host configuration.');
    runtimeConfig = config;
    GoogleOAuth.configureRuntime({ config });
}
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

module.exports = { fs, axios, CONFIG, Logger, GoogleOAuth, configureGoogleSheetsRuntime, formatSheetImageModeValue, mergeShoppingSheetOptions, mergeTopicSheetOptions, parseSheetImageModeValue, resolveShoppingSheetState, resolveTopicSheetState, stringifySheetOptionsValue, SNS_SHEET_NAME, SNS_SHEET_HEADERS, buildSnsStatusValidationRequest, CARD_NEWS_SHEET_NAME, CARD_NEWS_SHEET_HEADERS, buildCardNewsStatusValidationRequests, buildTopicRowMoveRequest, getAgentEventStore };
