'use strict';

function uniqueSorted(values) {
    return [...new Set(values)].sort();
}

function countMatches(text, pattern) {
    return (String(text || '').match(pattern) || []).length;
}

function assertSchemaOnlySql(sql) {
    const source = String(sql || '');
    const violations = [];
    if (/^COPY\s/gmi.test(source)) violations.push('copy_statement');
    if (/^INSERT\s/gmi.test(source)) violations.push('insert_statement');
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gmi.test(source)) {
        violations.push('email_like_value');
    }
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g.test(source)) {
        violations.push('jwt_like_value');
    }
    if (/(?:password|secret|api[_-]?key|token)\s*[:=]\s*["'`][^"'`\n]+/gmi.test(source)) {
        violations.push('secret_assignment_like_value');
    }
    if (violations.length) {
        throw new Error(`Schema audit input rejected: ${violations.join(', ')}`);
    }
    return true;
}

function captureQualifiedNames(sql, pattern) {
    return uniqueSorted(
        [...String(sql || '').matchAll(pattern)]
            .map((match) => `${match[1].toLowerCase()}.${match[2].toLowerCase()}`)
    );
}

function extractSchemaSnapshot(sql) {
    assertSchemaOnlySql(sql);
    const source = String(sql || '');
    return Object.freeze({
        tables: Object.freeze(captureQualifiedNames(
            source,
            /^CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"\."([^"]+)"/gmi
        )),
        functions: Object.freeze(captureQualifiedNames(
            source,
            /^CREATE (?:OR REPLACE )?FUNCTION "([^"]+)"\."([^"]+)"/gmi
        )),
        indexes: Object.freeze(captureQualifiedNames(
            source,
            /^CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"\."([^"]+)"/gmi
        )),
        rlsEnabledTables: Object.freeze(captureQualifiedNames(
            source,
            /^ALTER TABLE "([^"]+)"\."([^"]+)" ENABLE ROW LEVEL SECURITY;/gmi
        )),
        policyTables: Object.freeze(captureQualifiedNames(
            source,
            /^CREATE POLICY "[^"]+" ON "([^"]+)"\."([^"]+)"/gmi
        )),
        counts: Object.freeze({
            grants: countMatches(source, /^GRANT\s/gmi),
            revokes: countMatches(source, /^REVOKE\s/gmi),
            constraints: countMatches(source, /^\s*ADD CONSTRAINT\s/gmi)
        })
    });
}

function extractRepoSqlSnapshot(assets) {
    const tables = [];
    const functions = [];
    for (const asset of assets || []) {
        const source = String(asset.sql || '');
        for (const match of source.matchAll(
            /create table(?: if not exists)?\s+(?:(\w+)\.)?(\w+)/gmi
        )) {
            tables.push(`${(match[1] || 'public').toLowerCase()}.${match[2].toLowerCase()}`);
        }
        for (const match of source.matchAll(
            /create(?: or replace)? function\s+(?:(\w+)\.)?(\w+)/gmi
        )) {
            functions.push(`${(match[1] || 'public').toLowerCase()}.${match[2].toLowerCase()}`);
        }
    }
    return Object.freeze({
        tables: Object.freeze(uniqueSorted(tables)),
        functions: Object.freeze(uniqueSorted(functions))
    });
}

function compareNames(productionNames, repoNames) {
    const production = uniqueSorted(productionNames || []);
    const repo = uniqueSorted(repoNames || []);
    const productionSet = new Set(production);
    const repoSet = new Set(repo);
    return Object.freeze({
        shared: Object.freeze(production.filter((name) => repoSet.has(name))),
        productionOnly: Object.freeze(production.filter((name) => !repoSet.has(name))),
        repoOnly: Object.freeze(repo.filter((name) => !productionSet.has(name)))
    });
}

function compareSchemaToRepo(productionSnapshot, repoSnapshot, includedSchemas = ['public', 'trends']) {
    const prefixes = includedSchemas.map((schema) => `${String(schema).toLowerCase()}.`);
    const included = (name) => prefixes.some((prefix) => name.startsWith(prefix));
    return Object.freeze({
        tables: compareNames(
            productionSnapshot.tables.filter(included),
            repoSnapshot.tables.filter(included)
        ),
        functions: compareNames(
            productionSnapshot.functions.filter(included),
            repoSnapshot.functions.filter(included)
        )
    });
}

module.exports = {
    assertSchemaOnlySql,
    extractSchemaSnapshot,
    extractRepoSqlSnapshot,
    compareNames,
    compareSchemaToRepo
};
