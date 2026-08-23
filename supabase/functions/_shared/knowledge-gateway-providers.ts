import { createNaverNewsRoute } from "./knowledge-provider-naver-news.ts";

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
  shouldFetch?: (query: Record<string, unknown>) => boolean;
  fetchSnapshot: (query: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const naverNewsRoute = createNaverNewsRoute();
const ROUTES = new Map<string, KnowledgeProviderRoute>([
  [`${naverNewsRoute.kind}:${naverNewsRoute.purpose}`, naverNewsRoute],
]);

export function resolveKnowledgeProviderRoute(kind: string, purpose: string) {
  return ROUTES.get(`${kind}:${purpose}`) || null;
}
