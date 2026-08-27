# Development Environment Stage 4A — Production Schema Audit

> Parent: `feature/development-environment-main`
> Branch: `feature/development-environment-04a-production-schema-audit`
> User approval for read-only production inspection: granted 2026-08-27
> Production mutation: prohibited

## Scope

- collect schema-only definitions for production-managed application schemas;
- inventory Edge Functions, Cron jobs, Storage buckets, extensions, RLS, policies, and grants;
- reject dump artifacts containing row data or credential-like values;
- compare production structure, repository SQL intent, and application contracts;
- classify every production-only and repo-only object;
- decide the inclusion boundary for the Stage 4B baseline.

## Collection rules

- use only schema-only dump, Function list, security advisor, and explicit metadata `SELECT` queries;
- never query Auth users, license rows, emails, HWIDs, payment data, Storage objects, Vault values, or
  provider secrets;
- keep raw schema dumps in a private temporary directory and commit only sanitized findings;
- do not run migration, link, reset, seed, Function deploy, Cron mutation, or secret commands;
- production project identity must pass the Stage 3 `schema-audit` preflight first.

## Evidence

- Supabase CLI `2.114.0`;
- schema-only dumps for `public`, `trends`, and platform schemas needed for separation decisions;
- metadata-only queries for schema names, extensions, Cron jobs, Storage bucket configuration, and
  RLS policy names;
- deployed Edge Function list;
- production security advisor warnings;
- repository SQL inventory and current application RPC call sites.

## Verification

- schema dump contains zero `COPY` and zero `INSERT` statements;
- schema dump contains no email-, JWT-, or credential-like values;
- custom-schema object comparison has a classification and handling decision for every difference;
- deployed Function, Cron, and Storage configuration is compared with repository intent;
- production mutation remains zero.

## Handoff gate

The user reviews the audit conclusions and automated checks. Commit, parent merge, branch deletion, and
Stage 4B baseline generation require explicit requests.
