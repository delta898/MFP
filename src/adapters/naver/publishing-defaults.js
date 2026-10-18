'use strict';

const WAIT = Object.freeze({ LOAD: 3000, UPLOAD: 2000 });
const TYPING_PRESETS = Object.freeze({
    QUICK: Object.freeze({ MIN: 0, MAX: 2 }),
    FAST: Object.freeze({ MIN: 1, MAX: 8 }),
    NORMAL: Object.freeze({ MIN: 5, MAX: 45 }),
    HUMAN: Object.freeze({ MIN: 24, MAX: 60 })
});

module.exports = Object.freeze({ WAIT, TYPING_PRESETS });
