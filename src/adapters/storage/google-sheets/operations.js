'use strict';

module.exports = Object.assign(
    {},
    require('./base'),
    require('./topic-store'),
    require('./shopping-store'),
    require('./research-store'),
    require('./trend-store')
);
