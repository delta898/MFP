'use strict';

const crypto = require('node:crypto');

function createSiteHostingProjectService(deps = {}) {
    const repository = deps.repository;
    if (!repository) throw new TypeError('Site Hosting project repository port is required.');
    const now = deps.now || (() => new Date().toISOString());
    const createId = deps.createId || (() => crypto.randomUUID().replace(/-/g, ''));

    function list() {
        const projects = repository.list();
        if (!projects.length) {
            const timestamp = now();
            try {
                repository.create({
                    id: 'default',
                    name: '내 사이트',
                    created_at: timestamp,
                    updated_at: timestamp
                });
            } catch (error) {
                if (error?.code !== 'SITE_HOSTING_PROJECT_ALREADY_EXISTS' || !repository.list().length) throw error;
            }
        }
        return repository.list().map(({ id, name, root_domain, created_at, updated_at, site_count }) => ({
            id, name, root_domain, created_at, updated_at, site_count
        }));
    }

    function get(id) {
        const project = repository.get(id);
        if (!project) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        return project;
    }

    function create(payload = {}) {
        const name = String(payload.name || '').trim();
        if (!name) {
            const error = new Error('프로젝트 이름을 입력해 주세요.');
            error.code = 'SITE_HOSTING_PROJECT_NAME_REQUIRED';
            error.status = 400;
            throw error;
        }
        if (name.length > 80) {
            const error = new Error('프로젝트 이름은 80자 이내로 입력해 주세요.');
            error.code = 'SITE_HOSTING_PROJECT_NAME_TOO_LONG';
            error.status = 400;
            throw error;
        }
        const timestamp = now();
        const created = repository.create({
            id: createId(),
            name,
            created_at: timestamp,
            updated_at: timestamp
        });
        return { root_domain: '', ...created };
    }

    return { list, get, create };
}

module.exports = { createSiteHostingProjectService };
