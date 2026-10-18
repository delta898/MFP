const crypto = require('crypto');
const { RECOMMENDATION_KINDS, isPlainObject } = require('../core/contract');
const { IDENTIFIER_PATTERN, validateRecommendationCandidate } = require('../core/validators');

const PRODUCER_RUNTIME_SCHEMA_VERSION = 1;
const MAX_CANDIDATES_PER_PRODUCER = 20;
const MAX_CANDIDATES_PER_RUN = 50;
const MAX_DIAGNOSTIC_ENTRIES = 50;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function boundedInteger(value, fallback, ceiling) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(ceiling, Math.floor(parsed)));
}

function normalizeProducer(producer = {}) {
    const id = compact(producer.id, 240);
    const version = Number(producer.version);
    const kinds = [...new Set(
        (Array.isArray(producer.kinds) ? producer.kinds : [])
            .map((kind) => compact(kind, 60).toLowerCase())
            .filter(Boolean)
    )];
    if (!IDENTIFIER_PATTERN.test(id)) throw new Error('producer id is invalid');
    if (!Number.isInteger(version) || version < 1) throw new Error(`producer version is invalid: ${id}`);
    if (kinds.length === 0 || kinds.some((kind) => !RECOMMENDATION_KINDS.includes(kind))) {
        throw new Error(`producer kinds are invalid: ${id}`);
    }
    if (typeof producer.produce !== 'function') throw new Error(`producer function is missing: ${id}`);
    return { id, version, kinds, produce: producer.produce.bind(producer) };
}

function resolveOwner(input = {}, context = {}) {
    const values = [
        input.owner_user_id,
        context.owner_user_id,
        context?.memory?.owner_memory?.owner_user_id
    ].map((value) => compact(value, 240)).filter(Boolean);
    const distinct = [...new Set(values)];
    if (distinct.length > 1) return { ownerUserId: '', code: 'OWNER_CONTEXT_CONFLICT' };
    if (distinct.length === 0 || !IDENTIFIER_PATTERN.test(distinct[0])) {
        return { ownerUserId: '', code: 'OWNER_CONTEXT_MISSING' };
    }
    return { ownerUserId: distinct[0], code: '' };
}

function createDiagnostics(producerCount) {
    return {
        producer_count: producerCount,
        completed_producer_ids: [],
        failed: [],
        invalid: [],
        duplicate_count: 0,
        truncated_count: 0
    };
}

function appendDiagnostic(list, value) {
    if (list.length < MAX_DIAGNOSTIC_ENTRIES) list.push(value);
}

function validateProducerResultShape(result) {
    if (!isPlainObject(result)) return false;
    if (Object.keys(result).some((key) => key !== 'candidates')) return false;
    return Array.isArray(result.candidates);
}

function createRecommendationProducerRunner(options = {}) {
    const rawProducers = Array.isArray(options.producers) ? options.producers : [];
    const producers = rawProducers.map(normalizeProducer);
    if (new Set(producers.map((producer) => producer.id)).size !== producers.length) {
        throw new Error('producer ids must be unique');
    }
    const perProducerLimit = boundedInteger(
        options.maxCandidatesPerProducer,
        MAX_CANDIDATES_PER_PRODUCER,
        MAX_CANDIDATES_PER_PRODUCER
    );
    const totalLimit = boundedInteger(options.maxCandidatesPerRun, MAX_CANDIDATES_PER_RUN, MAX_CANDIDATES_PER_RUN);
    const runIdFactory = typeof options.runIdFactory === 'function'
        ? options.runIdFactory
        : () => `producer_run:${crypto.randomUUID()}`;

    return {
        list() {
            return producers.map(({ id, version, kinds }) => ({ id, version, kinds: [...kinds] }));
        },
        async run(input = {}, context = {}) {
            const runId = compact(runIdFactory(), 240);
            if (!IDENTIFIER_PATTERN.test(runId)) throw new Error('producer run id is invalid');
            const owner = resolveOwner(input, context);
            const diagnostics = createDiagnostics(producers.length);
            if (!owner.ownerUserId) {
                appendDiagnostic(diagnostics.failed, { producer_id: 'runtime', code: owner.code });
                return {
                    schema_version: PRODUCER_RUNTIME_SCHEMA_VERSION,
                    run_id: runId,
                    owner_user_id: '',
                    candidates: [],
                    diagnostics
                };
            }

            const producerInput = { ...input, owner_user_id: owner.ownerUserId };
            const producerContext = { ...context, owner_user_id: owner.ownerUserId };
            const executions = await Promise.all(producers.map(async (producer) => {
                try {
                    return { producer, result: await producer.produce(producerInput, producerContext), failed: false };
                } catch (_error) {
                    return { producer, result: null, failed: true };
                }
            }));

            const candidates = [];
            const candidateIds = new Set();
            const dedupeKeys = new Set();
            for (const execution of executions) {
                const producer = execution.producer;
                if (execution.failed) {
                    appendDiagnostic(diagnostics.failed, { producer_id: producer.id, code: 'PRODUCER_FAILED' });
                    continue;
                }
                diagnostics.completed_producer_ids.push(producer.id);
                if (!validateProducerResultShape(execution.result)) {
                    appendDiagnostic(diagnostics.invalid, {
                        producer_id: producer.id,
                        candidate_index: -1,
                        code: 'PRODUCER_RESULT_INVALID'
                    });
                    continue;
                }

                const rawCandidates = execution.result.candidates;
                if (rawCandidates.length > perProducerLimit) {
                    diagnostics.truncated_count += rawCandidates.length - perProducerLimit;
                }
                for (const [index, rawCandidate] of rawCandidates.slice(0, perProducerLimit).entries()) {
                    if (!isPlainObject(rawCandidate)) {
                        appendDiagnostic(diagnostics.invalid, {
                            producer_id: producer.id,
                            candidate_index: index,
                            code: 'CANDIDATE_SHAPE_INVALID'
                        });
                        continue;
                    }
                    if (compact(rawCandidate.producer_id || rawCandidate.producerId, 240) !== producer.id) {
                        appendDiagnostic(diagnostics.invalid, {
                            producer_id: producer.id,
                            candidate_index: index,
                            code: 'CANDIDATE_PRODUCER_MISMATCH'
                        });
                        continue;
                    }
                    if (!producer.kinds.includes(compact(rawCandidate.kind, 60).toLowerCase())) {
                        appendDiagnostic(diagnostics.invalid, {
                            producer_id: producer.id,
                            candidate_index: index,
                            code: 'CANDIDATE_KIND_UNDECLARED'
                        });
                        continue;
                    }
                    if (compact(rawCandidate.owner_user_id || rawCandidate.ownerUserId, 240) !== owner.ownerUserId) {
                        appendDiagnostic(diagnostics.invalid, {
                            producer_id: producer.id,
                            candidate_index: index,
                            code: 'CANDIDATE_OWNER_MISMATCH'
                        });
                        continue;
                    }
                    const validated = validateRecommendationCandidate(rawCandidate);
                    if (!validated.ok) {
                        appendDiagnostic(diagnostics.invalid, {
                            producer_id: producer.id,
                            candidate_index: index,
                            code: 'CANDIDATE_CONTRACT_INVALID'
                        });
                        continue;
                    }
                    if (candidateIds.has(validated.value.candidate_id) || dedupeKeys.has(validated.value.dedupe_key)) {
                        diagnostics.duplicate_count += 1;
                        continue;
                    }
                    if (candidates.length >= totalLimit) {
                        diagnostics.truncated_count += 1;
                        continue;
                    }
                    candidateIds.add(validated.value.candidate_id);
                    dedupeKeys.add(validated.value.dedupe_key);
                    candidates.push(validated.value);
                }
            }

            return {
                schema_version: PRODUCER_RUNTIME_SCHEMA_VERSION,
                run_id: runId,
                owner_user_id: owner.ownerUserId,
                candidates,
                diagnostics
            };
        }
    };
}

module.exports = {
    PRODUCER_RUNTIME_SCHEMA_VERSION,
    MAX_CANDIDATES_PER_PRODUCER,
    MAX_CANDIDATES_PER_RUN,
    createRecommendationProducerRunner,
    normalizeProducer,
    resolveOwner
};
