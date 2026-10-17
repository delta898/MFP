'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');

const WIDGET_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SLOT_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const ASSET_PATH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const ALLOWED_EXTENSIONS = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2']);

class WidgetPluginCatalogError extends Error {
    constructor(message, code = 'WIDGET_PLUGIN_INVALID', options = {}) {
        super(message, options);
        this.name = 'WidgetPluginCatalogError';
        this.code = code;
    }
}

function normalizeAssetPath(value, label) {
    if (typeof value !== 'string' || !ASSET_PATH.test(value) || value.includes('\\')) {
        throw new WidgetPluginCatalogError(`${label} must be a safe relative asset path.`);
    }
    const segments = value.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new WidgetPluginCatalogError(`${label} must not contain traversal segments.`);
    }
    const normalized = segments.join('/');
    if (!ALLOWED_EXTENSIONS.has(pathDefault.extname(normalized).toLowerCase())) {
        throw new WidgetPluginCatalogError(`${label} uses an unsupported asset type.`);
    }
    return normalized;
}

function normalizeWidgetPackage(packageMetadata, packageRoot, path = pathDefault) {
    const manifest = packageMetadata?.bloggeniusWidget;
    const manifestKeys = new Set(['manifestVersion', 'id', 'name', 'summary', 'widgets']);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
        || Object.keys(manifest).some((key) => !manifestKeys.has(key))
        || manifest.manifestVersion !== 1
        || typeof manifest.id !== 'string' || !WIDGET_ID.test(manifest.id)
        || typeof manifest.name !== 'string' || !manifest.name.trim()
        || typeof manifest.summary !== 'string' || !manifest.summary.trim()
        || !Array.isArray(manifest.widgets) || manifest.widgets.length === 0) {
        throw new WidgetPluginCatalogError('Widget Plugin package metadata is invalid.');
    }
    const seenWidgetIds = new Set();
    const widgets = manifest.widgets.map((widget, index) => {
        const widgetKeys = new Set(['id', 'name', 'slot', 'entry', 'assets', 'width', 'height', 'maxHeight']);
        if (!widget || typeof widget !== 'object' || Array.isArray(widget)
            || Object.keys(widget).some((key) => !widgetKeys.has(key))
            || typeof widget.id !== 'string' || !WIDGET_ID.test(widget.id)
            || (widget.name !== undefined && (typeof widget.name !== 'string' || !widget.name.trim()))
            || typeof widget.slot !== 'string' || !SLOT_ID.test(widget.slot)
            || !Array.isArray(widget.assets) || widget.assets.length === 0
            || !Number.isInteger(widget.width) || widget.width < 120 || widget.width > 1200
            || !Number.isInteger(widget.height) || widget.height < 80 || widget.height > 1200
            || !Number.isInteger(widget.maxHeight) || widget.maxHeight < widget.height || widget.maxHeight > 1600) {
            throw new WidgetPluginCatalogError(`Widget contribution at index ${index} is invalid.`);
        }
        if (seenWidgetIds.has(widget.id)) throw new WidgetPluginCatalogError(`Widget id is duplicated: ${widget.id}`);
        seenWidgetIds.add(widget.id);
        const entry = normalizeAssetPath(widget.entry, `Widget ${widget.id} entry`);
        const assets = widget.assets.map((asset) => normalizeAssetPath(asset, `Widget ${widget.id} asset`));
        if (!assets.includes(entry) || new Set(assets).size !== assets.length) {
            throw new WidgetPluginCatalogError(`Widget ${widget.id} assets must uniquely include its entry point.`);
        }
        return Object.freeze({
            id: widget.id,
            pluginId: manifest.id,
            name: String(widget.name || manifest.name).trim(),
            summary: manifest.summary.trim(),
            slot: widget.slot,
            entry,
            assets: Object.freeze(assets),
            width: widget.width,
            height: widget.height,
            maxHeight: widget.maxHeight,
            packageRoot
        });
    });
    return Object.freeze({ id: manifest.id, name: manifest.name.trim(), widgets: Object.freeze(widgets) });
}

function createWidgetPluginCatalog(options = {}) {
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const logger = options.logger || null;
    const roots = Array.isArray(options.roots) ? options.roots.filter((root) => typeof root === 'string' && root.trim()) : [];
    const plugins = new Map();
    const widgets = new Map();

    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        let children;
        try { children = fs.readdirSync(root, { withFileTypes: true }); }
        catch {
            logger?.warn?.('[Widget Plugin] Cannot read a package directory; skipping that directory.');
            continue;
        }
        for (const child of children) {
            if (!child.isDirectory()) continue;
            const packageRoot = path.resolve(root, child.name);
            const packageJsonPath = path.join(packageRoot, 'package.json');
            if (!fs.existsSync(packageJsonPath)) continue;
            let packageMetadata;
            try { packageMetadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')); }
            catch {
                logger?.warn?.('[Widget Plugin] Invalid package metadata; skipping that package.');
                continue;
            }
            if (!packageMetadata?.bloggeniusWidget) continue;
            let normalized;
            try {
                normalized = normalizeWidgetPackage(packageMetadata, packageRoot, path);
                if (child.name !== normalized.id) {
                    throw new WidgetPluginCatalogError(`Widget Plugin directory must match package id: ${normalized.id}`);
                }
            } catch {
                logger?.warn?.('[Widget Plugin] Invalid package manifest; skipping that package.');
                continue;
            }
            // Earlier roots have higher precedence (user-installed packages precede bundled packages).
            if (plugins.has(normalized.id)) continue;
            plugins.set(normalized.id, normalized);
            for (const widget of normalized.widgets) {
                const key = `${normalized.id}/${widget.id}`;
                if (widgets.has(key)) throw new WidgetPluginCatalogError(`Widget contribution is duplicated: ${key}`, 'WIDGET_PLUGIN_DUPLICATE');
                widgets.set(key, widget);
            }
        }
    }

    function list(slot = '') {
        const targetSlot = String(slot || '').trim();
        return Object.freeze(Array.from(widgets.values())
            .filter((widget) => !targetSlot || widget.slot === targetSlot)
            .map(({ packageRoot, assets, ...widget }) => Object.freeze({
                ...widget,
                entryUrl: `/widget-plugins/${encodeURIComponent(widget.pluginId)}/${encodeURIComponent(widget.id)}/${widget.entry}`
            })));
    }

    function resolveAsset(pluginId, widgetId, relativePath) {
        const contribution = widgets.get(`${String(pluginId || '')}/${String(widgetId || '')}`);
        if (!contribution) return null;
        let asset;
        try { asset = normalizeAssetPath(relativePath, 'Requested asset'); }
        catch (_) { return null; }
        if (!contribution.assets.includes(asset)) return null;
        const packageRoot = path.resolve(contribution.packageRoot);
        const filePath = path.resolve(packageRoot, asset);
        if (!filePath.startsWith(`${packageRoot}${path.sep}`)) return null;
        let realPath;
        try { realPath = fs.realpathSync(filePath); }
        catch (_) { return null; }
        if (!realPath.startsWith(`${fs.realpathSync(packageRoot)}${path.sep}`)) return null;
        try { if (!fs.statSync(realPath).isFile()) return null; }
        catch (_) { return null; }
        return realPath;
    }

    return Object.freeze({ list, resolveAsset });
}

module.exports = { WidgetPluginCatalogError, createWidgetPluginCatalog, normalizeWidgetPackage };
