'use strict';

const { version = '0.0.0' } = require('../../package.json');

module.exports = Object.freeze({ APP_VERSION: version || '0.0.0' });
