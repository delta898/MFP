import {
  normalizeSerpApiCollectionRequest,
  normalizeSerpApiCollectionRun,
  SERPAPI_NEWS_PROVIDER_ID,
} from "./serpapi-collection-contract.ts";

type CollectionResult = {
  provider_id: string;
  lane: string;
  attempted_upstream: boolean;
  fetched_count: number;
  accepted_count: number;
  rejected_count: number;
  observations: Record<string, unknown>[];
};

type Collector = {
  collect: (request: unknown) => Promise<CollectionResult>;
};

type CorpusStore = {
  upsertObservations: (
    providerId: string,
    observations: Record<string, unknown>[],
  ) => Promise<{ accepted_count: number; inserted_count: number; refreshed_count: number }>;
  recordRun: (run: Record<string, unknown>) => Promise<unknown>;
};

type ServiceOptions = {
  collector: Collector;
  store: CorpusStore;
  now?: () => Date;
  randomUUID?: () => string;
};

const PROVIDER_ERROR_CODES = new Set([
  "SERPAPI_NOT_CONFIGURED",
  "SERPAPI_LANE_NOT_CONFIGURED",
  "SERPAPI_AUTH_FAILED",
  "SERPAPI_RATE_LIMITED",
  "SERPAPI_REQUEST_REJECTED",
  "SERPAPI_INVALID_RESPONSE",
  "SERPAPI_UPSTREAM_FAILED",
  "COLLECTION_PROVIDER_RESULT_INVALID",
]);

function errorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  return PROVIDER_ERROR_CODES.has(code) ? code : "COLLECTION_FAILED";
}

function attemptedUpstream(error: unknown) {
  return Boolean(error && typeof error === "object" && "attemptedUpstream" in error
    && (error as { attemptedUpstream?: unknown }).attemptedUpstream === true);
}

function count(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 500) throw new Error(`${field}_invalid`);
  return parsed;
}

function serviceError(code: string, run?: Record<string, unknown>) {
  const error = new Error(code) as Error & { code?: string; run?: Record<string, unknown> };
  error.code = code;
  if (run) error.run = run;
  return error;
}

export function createSerpApiCollectionService(options: ServiceOptions) {
  const now = options.now || (() => new Date());
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());

  async function persistRun(run: Record<string, unknown>) {
    try {
      await options.store.recordRun(run);
    } catch (_error) {
      throw serviceError("COLLECTION_RUN_STORE_FAILED", run);
    }
  }

  return {
    async run(rawRequest: unknown) {
      const request = normalizeSerpApiCollectionRequest(rawRequest);
      const runId = `kcr_${randomUUID()}`;
      const startedAt = now().toISOString();
      let fetchedCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;
      let didAttemptUpstream = false;

      try {
        const providerResult = await options.collector.collect(request);
        didAttemptUpstream = providerResult?.attempted_upstream === true;
        if (providerResult.provider_id !== SERPAPI_NEWS_PROVIDER_ID
          || providerResult.lane !== request.lane
          || providerResult.attempted_upstream !== true
          || !Array.isArray(providerResult.observations)) {
          throw serviceError("COLLECTION_PROVIDER_RESULT_INVALID");
        }
        const nextFetchedCount = count(providerResult.fetched_count, "fetched_count");
        const nextAcceptedCount = count(providerResult.accepted_count, "accepted_count");
        const nextRejectedCount = count(providerResult.rejected_count, "rejected_count");
        if (nextAcceptedCount !== providerResult.observations.length
          || nextAcceptedCount + nextRejectedCount !== nextFetchedCount) {
          throw serviceError("COLLECTION_PROVIDER_RESULT_INVALID");
        }
        fetchedCount = nextFetchedCount;
        acceptedCount = nextAcceptedCount;
        rejectedCount = nextRejectedCount;

        let insertedCount = 0;
        let refreshedCount = 0;
        if (providerResult.observations.length > 0) {
          try {
            const stored = await options.store.upsertObservations(
              SERPAPI_NEWS_PROVIDER_ID,
              providerResult.observations,
            );
            if (count(stored.accepted_count, "stored_accepted_count") !== acceptedCount) {
              throw serviceError("OBSERVATION_STORE_FAILED");
            }
            insertedCount = count(stored.inserted_count, "inserted_count");
            refreshedCount = count(stored.refreshed_count, "refreshed_count");
            if (insertedCount + refreshedCount !== acceptedCount) {
              throw serviceError("OBSERVATION_STORE_FAILED");
            }
          } catch (_error) {
            throw serviceError("OBSERVATION_STORE_FAILED");
          }
        }

        const run = normalizeSerpApiCollectionRun({
          schema_version: 1,
          run_id: runId,
          provider_id: SERPAPI_NEWS_PROVIDER_ID,
          lane: request.lane,
          trigger: request.trigger,
          status: "succeeded",
          attempted_upstream: true,
          fetched_count: fetchedCount,
          accepted_count: acceptedCount,
          inserted_count: insertedCount,
          refreshed_count: refreshedCount,
          rejected_count: rejectedCount,
          error_code: "",
          started_at: startedAt,
          completed_at: now().toISOString(),
        });
        await persistRun(run);
        return run;
      } catch (error) {
        if ((error as { code?: string })?.code === "COLLECTION_RUN_STORE_FAILED") throw error;
        const code = (error as { code?: string })?.code === "OBSERVATION_STORE_FAILED"
          ? "OBSERVATION_STORE_FAILED"
          : errorCode(error);
        const run = normalizeSerpApiCollectionRun({
          schema_version: 1,
          run_id: runId,
          provider_id: SERPAPI_NEWS_PROVIDER_ID,
          lane: request.lane,
          trigger: request.trigger,
          status: "failed",
          attempted_upstream: didAttemptUpstream || attemptedUpstream(error),
          fetched_count: fetchedCount,
          accepted_count: acceptedCount,
          inserted_count: 0,
          refreshed_count: 0,
          rejected_count: rejectedCount,
          error_code: code,
          started_at: startedAt,
          completed_at: now().toISOString(),
        });
        await persistRun(run);
        throw serviceError(code, run);
      }
    },
  };
}
