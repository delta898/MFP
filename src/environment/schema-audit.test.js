'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assertSchemaOnlySql,
    extractSchemaSnapshot,
    extractRepoSqlSnapshot,
    compareSchemaToRepo
} = require('./schema-audit');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "public"."licenses" (
    "id" "uuid" NOT NULL
);
CREATE TABLE IF NOT EXISTS "trends"."items" (
    "id" bigint NOT NULL
);
CREATE OR REPLACE FUNCTION "public"."check_license"() RETURNS boolean
LANGUAGE "sql" AS $$ SELECT true $$;
CREATE UNIQUE INDEX "licenses_pkey" ON "public"."licenses" USING "btree" ("id");
ALTER TABLE "public"."licenses" ENABLE ROW LEVEL SECURITY;
GRANT EXECUTE ON FUNCTION "public"."check_license"() TO "anon";
`;

test('schema-only guard rejects data and credential-like content', () => {
    assert.equal(assertSchemaOnlySql(SCHEMA_SQL), true);
    assert.throws(() => assertSchemaOnlySql('COPY public.users FROM stdin;'), /copy_statement/);
    assert.throws(() => assertSchemaOnlySql("INSERT INTO x VALUES ('a@b.com');"), /insert_statement/);
    assert.throws(() => assertSchemaOnlySql("password='visible-value'"), /secret_assignment/);
});

test('schema snapshot extracts qualified structural objects without function bodies', () => {
    const snapshot = extractSchemaSnapshot(SCHEMA_SQL);
    assert.deepEqual(snapshot.tables, ['public.licenses', 'trends.items']);
    assert.deepEqual(snapshot.functions, ['public.check_license']);
    assert.deepEqual(snapshot.indexes, ['public.licenses']);
    assert.deepEqual(snapshot.rlsEnabledTables, ['public.licenses']);
    assert.equal(snapshot.counts.grants, 1);
});

test('repo SQL snapshot and comparison expose production-only and repo-only objects', () => {
    const production = extractSchemaSnapshot(SCHEMA_SQL);
    const repo = extractRepoSqlSnapshot([{ sql: `
        create table if not exists public.license_plans (id uuid);
        create table if not exists trends.items (id bigint);
        create or replace function public.check_license() returns boolean language sql as $$ select true $$;
    ` }]);
    const comparison = compareSchemaToRepo(production, repo);

    assert.deepEqual(comparison.tables.shared, ['trends.items']);
    assert.deepEqual(comparison.tables.productionOnly, ['public.licenses']);
    assert.deepEqual(comparison.tables.repoOnly, ['public.license_plans']);
    assert.deepEqual(comparison.functions.shared, ['public.check_license']);
});
