export type KnowledgeProviderRoute = {
  providerId: string;
  kind: "trends" | "news";
  purpose: "content_ideas";
  operation: string;
  cacheTtlSeconds: number;
  staleTtlSeconds: number;
  quotaLimit: number;
  quotaWindowSeconds: number;
  upstreamTimeoutMs: number;
  fetchSnapshot: (query: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

// Stage 4 intentionally ships no live upstream route. Stage 5 adds one audited provider adapter
// and registers its fixed semantic kind/purpose here after quality, cost and terms review.
const ROUTES = new Map<string, KnowledgeProviderRoute>();

export function resolveKnowledgeProviderRoute(kind: string, purpose: string) {
  return ROUTES.get(`${kind}:${purpose}`) || null;
}
