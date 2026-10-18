'use strict';

const { createSiteHostingProjectService } = require('../applications/site-hosting/application/project-service');
const { createSiteHostingSiteService } = require('../applications/site-hosting/application/site-service');
const { createSiteHostingProjectRepository } = require('../adapters/storage/site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../adapters/storage/site-hosting/site-repository');
const { createGitHubSiteTemplateCatalog } = require('../adapters/catalogs/amade/site-template-catalog');
const { createSiteHostingDesktop } = require('../host/electron/site-hosting-desktop');
const { createAstroSiteHostingSystem } = require('./astro-site-hosting');

function createSiteHostingApplication(options = {}) {
    const projectRepository = options.projectRepository || createSiteHostingProjectRepository({
        fs: options.fs,
        path: options.path,
        workspaceDir: options.workspaceDir
    });
    const templates = options.templates || createGitHubSiteTemplateCatalog({
        fs: options.fs,
        path: options.path,
        cacheRoot: options.templateCacheRoot || require('node:path').join(String(options.workspaceDir || ''), 'site-hosting', 'template-cache'),
        catalogUrl: options.templateCatalogUrl,
        environment: options.runtimeEnvironment,
        fetchImpl: options.fetchImpl
    });
    const repository = options.repository || createSiteHostingSiteRepository({
        fs: options.fs,
        path: options.path,
        projectRepository,
        templates
    });
    const siteHostingSystem = options.siteHostingSystem || createAstroSiteHostingSystem({
        ...options,
        projectRepository,
        siteRepository: repository,
        templates
    });
    const desktop = options.desktop || createSiteHostingDesktop();
    const projectService = createSiteHostingProjectService({ ...options, repository: projectRepository });
    const siteService = createSiteHostingSiteService({
        ...options,
        projectRepository,
        repository,
        templates,
        astroRuntime: siteHostingSystem.siteHosting,
        desktop
    });

    return Object.freeze({ projectService, siteService, projectRepository, repository, templates, siteHostingSystem });
}

module.exports = { createSiteHostingApplication };
