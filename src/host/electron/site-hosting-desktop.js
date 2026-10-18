'use strict';

function createSiteHostingDesktop(options = {}) {
    const loadElectron = options.loadElectron || (() => require('electron'));
    const dialog = Object.freeze({
        showOpenDialog: (...args) => loadElectron().dialog.showOpenDialog(...args)
    });
    return Object.freeze({
        dialog,
        openExternal: (url) => loadElectron().shell.openExternal(url),
        openPath: (target) => loadElectron().shell.openPath(target),
        extractZip: async (zipPath, extractOptions) => {
            const module = await import('@electron-internal/extract-zip');
            return module.extract(zipPath, extractOptions);
        }
    });
}

module.exports = { createSiteHostingDesktop };
