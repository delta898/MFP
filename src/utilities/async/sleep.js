'use strict';

function sleep(milliseconds) {
    const duration = Number(milliseconds);
    return new Promise((resolve) => setTimeout(resolve, Number.isFinite(duration) ? Math.max(0, duration) : 0));
}

module.exports = { sleep };
