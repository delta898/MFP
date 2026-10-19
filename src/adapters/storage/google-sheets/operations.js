'use strict';

const operations = Object.assign(
    {},
    require('./base'),
    require('./topic-store'),
    require('./shopping-store'),
    require('./research-store'),
    require('./trend-store')
);

operations.configureRuntime = require('./dependencies').configureGoogleSheetsRuntime;

module.exports = operations;
