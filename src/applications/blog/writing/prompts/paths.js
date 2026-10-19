'use strict';

const path = require('node:path');

module.exports = Object.freeze({
    BLOG_PROMPT_COMMON_FILE: path.join(__dirname, 'common.md'),
    BLOG_PROMPT_CONTRACT_FILE: path.join(__dirname, 'contract.md'),
    BLOG_PROMPT_SEARCH_FILE: path.join(__dirname, 'search.md'),
    BLOG_PROMPT_DISCOVERY_FILE: path.join(__dirname, 'discovery.md')
});
