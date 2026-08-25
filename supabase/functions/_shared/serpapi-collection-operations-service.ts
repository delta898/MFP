import {
  normalizeSerpApiCollectionRequest,
  normalizeSerpApiCollectionRun,
  SERPAPI_NEWS_PROVIDER_ID,
} from "./serpapi-collection-contract.ts";

type AccountStatus = {
  checked_at: string;
  searches_limit: number;
  searches_used: number;
  searches_remaining: number;
  renewal_date: string;
};

type LeaseResult = { acquired: boolean; reason: string; retry_after_seconds: number };
type BudgetResult = { reserved: boolean; duplicate: boolean; count: number; limit: number; reason: string };

type OperationsStore = {
  acquireLease: (providerId: string, leaseToken: string) => Promise<LeaseResult>;
  releaseLease: (providerId: string, leaseToken: string) => Promise<unknown>;
  recordAccountStatus: (providerId: string, status: AccountStatus) => Promise<unknown>;
  reserveBudget: (
    providerId: string,
    operationId: string,
    lane: string,
    trigger: string,
  ) => Promise<BudgetResult>;
  recordProviderSuccess: (providerId: string) => Promise<unknown>;
  recordProviderFailure: (providerId: string, errorCode: string) => Promise<unknown>;
  recordRun: (run: Record<string, unknown>) => Promise<unknown>;
};

type ServiceOptions = {
  accountProvider: { check: () => Promise<AccountStatus> };
  collectorService: { run: (request: unknown) => Promise<Record<string, unknown>> };
  store: OperationsStore;
  now?: () => Date;
  randomUUID?: () => string;
  protectedReserve?: number;
};

const ACCOUNT_ERROR_CODES = new Set([
  "SERPAPI_NOT_CONFIGURED",
  "SERPAPI_AUTH_FAILED",
  "SERPAPI_ACCOUNT_INACTIVE",
  "SERPAPI_ACCOUNT_RATE_LIMITED",
  "SERPAPI_ACCOUNT_UPSTREAM_FAILED",
  "SERPAPI_ACCOUNT_INVALID_RESPONSE",
  "SERPAPI_ACCOUNT_SEARCHES_LIMIT_INVALID",
  "SERPAPI_ACCOUNT_SEARCHES_USED_INVALID",
  "SERPAPI_ACCOUNT_SEARCHES_REMAINING_INVALID",
  "SERPAPI_ACCOUNT_EXTRA_CREDITS_INVALID",
  "SERPAPI_ACCOUNT_RENEWAL_DATE_INVALID",
  "SERPAPI_ACCOUNT_USAGE_INVALID",
]);

const PROVIDER_FAILURE_CODES = new Set([
  ...ACCOUNT_ERROR_CODES,
  "SERPAPI_LANE_NOT_CONFIGURED",
  "SERPAPI_RATE_LIMITED",
  "SERPAPI_REQUEST_REJECTED",
  "SERPAPI_INVALID_RESPONSE",
  "SERPAPI_UPSTREAM_FAILED",
]);

function stableCode(error: unknown, fallback = "COLLECTION_OPERATIONS_FAILED") {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : fallback;
}

function operationError(code: string, run?: Record<string, unknown>) {
  const error = new Error(code) as Error & { code?: string; run?: Record<string, unknown> };
  error.code = code;
  if (run) error.run = run;
  return error;
}

function validOperationId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^kco_[A-Za-z0-9:_-]{1,176}$/.test(text)) throw operationError("COLLECTION_OPERATION_ID_INVALID");
  return text;
}

export function createSerpApiCollectionOperationsService(options: ServiceOptions) {
  const now = options.now || (() => new Date());
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());
  const protectedReserve = Math.max(1, Math.min(Number(options.protectedReserve) || 50, 1000));

  async function recordTerminal(
    request: ReturnType<typeof normalizeSerpApiCollectionRequest>,
    status: "failed" | "skipped",
    code: string,
    startedAt: string,
  ) {
    const run = normalizeSerpApiCollectionRun({
      schema_version: 1,
      run_id: `kcr_${randomUUID()}`,
      provider_id: SERPAPI_NEWS_PROVIDER_ID,
      lane: request.lane,
      trigger: request.trigger,
      status,
      attempted_upstream: false,
      fetched_count: 0,
      accepted_count: 0,
      inserted_count: 0,
      refreshed_count: 0,
      rejected_count: 0,
      error_code: code,
      started_at: startedAt,
      completed_at: now().toISOString(),
    });
    try {
      await options.store.recordRun(run);
    } catch (_error) {
      throw operationError("COLLECTION_RUN_STORE_FAILED", run);
    }
    return run;
  }

  return {
    async run(rawRequest: unknown, rawOperationId: unknown) {
      const request = normalizeSerpApiCollectionRequest(rawRequest);
      const operationId = validOperationId(rawOperationId);
      const leaseToken = `kcl_${randomUUID()}`;
      const startedAt = now().toISOString();
      let leaseAcquired = false;
      try {
        let lease: LeaseResult;
        try {
          lease = await options.store.acquireLease(SERPAPI_NEWS_PROVIDER_ID, leaseToken);
        } catch (_error) {
          throw operationError("COLLECTION_CONTROL_STORE_FAILED");
        }
        if (!lease.acquired) {
          const code = lease.reason === "backoff"
            ? "COLLECTION_PROVIDER_BACKOFF"
            : "COLLECTION_ALREADY_RUNNING";
          return await recordTerminal(request, "skipped", code, startedAt);
        }
        leaseAcquired = true;

        let accountStatus: AccountStatus;
        try {
          accountStatus = await options.accountProvider.check();
        } catch (error) {
          const code = ACCOUNT_ERROR_CODES.has(stableCode(error))
            ? stableCode(error)
            : "SERPAPI_ACCOUNT_CHECK_FAILED";
          try {
            await options.store.recordProviderFailure(SERPAPI_NEWS_PROVIDER_ID, code);
          } catch (_storeError) {
            throw operationError("COLLECTION_CONTROL_STORE_FAILED");
          }
          const run = await recordTerminal(request, "failed", code, startedAt);
          throw operationError(code, run);
        }
        try {
          await options.store.recordAccountStatus(SERPAPI_NEWS_PROVIDER_ID, accountStatus);
        } catch (_error) {
          throw operationError("COLLECTION_CONTROL_STORE_FAILED");
        }

        if (accountStatus.searches_remaining <= protectedReserve) {
          return await recordTerminal(request, "skipped", "SERPAPI_ACCOUNT_RESERVE_PROTECTED", startedAt);
        }

        let budget: BudgetResult;
        try {
          budget = await options.store.reserveBudget(
            SERPAPI_NEWS_PROVIDER_ID,
            operationId,
            request.lane,
            request.trigger,
          );
        } catch (_error) {
          throw operationError("COLLECTION_BUDGET_STORE_FAILED");
        }
        if ((budget.reserved && budget.duplicate)
          || !Number.isInteger(budget.count) || budget.count < 0
          || !Number.isInteger(budget.limit) || budget.limit !== 200
          || budget.count > budget.limit) {
          throw operationError("COLLECTION_BUDGET_STORE_FAILED");
        }
        if (!budget.reserved) {
          const code = budget.duplicate
            ? "COLLECTION_OPERATION_DUPLICATE"
            : "COLLECTION_BUDGET_EXHAUSTED";
          return await recordTerminal(request, "skipped", code, startedAt);
        }

        try {
          const run = await options.collectorService.run(request);
          await options.store.recordProviderSuccess(SERPAPI_NEWS_PROVIDER_ID);
          return run;
        } catch (error) {
          const code = stableCode(error, "COLLECTION_FAILED");
          if (PROVIDER_FAILURE_CODES.has(code)) {
            try {
              await options.store.recordProviderFailure(SERPAPI_NEWS_PROVIDER_ID, code);
            } catch (_storeError) {
              throw operationError("COLLECTION_CONTROL_STORE_FAILED");
            }
          }
          throw error;
        }
      } finally {
        if (leaseAcquired) {
          try {
            await options.store.releaseLease(SERPAPI_NEWS_PROVIDER_ID, leaseToken);
          } catch (_error) {
            // The bounded lease expires automatically; upstream/run truth must not be rewritten.
          }
        }
      }
    },
  };
}
