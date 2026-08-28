import { createNaverNewsRoute } from "./knowledge-provider-naver-news.ts";
import { createNaverBlogReferenceRoute } from "./knowledge-provider-naver-blog-reference.ts";
import { createNaverShoppingProductRoute } from "./knowledge-provider-naver-shopping-product.ts";
import { createSerpApiCorpusRoute } from "./knowledge-provider-serpapi-corpus.ts";

type BaseKnowledgeProviderRoute = {
  providerId: string;
  kind: "trends" | "news" | "blog_reference" | "shopping_product";
  purpose: "content_ideas" | "serendipity" | "writing_reference" | "product_recovery";
  operation: string;
};

type UpstreamKnowledgeProviderRoute = BaseKnowledgeProviderRoute & {
  execution: "upstream";
  cacheTtlSeconds: number;
  staleTtlSeconds: number;
  quotaLimit: number;
  quotaWindowSeconds: number;
  upstreamTimeoutMs: number;
  shouldFetch?: (query: Record<string, unknown>) => boolean;
  fetchSnapshot: (query: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type StoredCorpusKnowledgeProviderRoute = BaseKnowledgeProviderRoute & {
  execution: "stored_corpus";
  readSnapshot: (
    client: {
      rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{
        data: unknown;
        error: null | { code?: string };
      }>;
    },
    query: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

export type KnowledgeProviderRoute = UpstreamKnowledgeProviderRoute | StoredCorpusKnowledgeProviderRoute;

const naverNewsRoute = createNaverNewsRoute();
const naverBlogReferenceRoute = createNaverBlogReferenceRoute();
const naverShoppingProductRoute = createNaverShoppingProductRoute();
const serpApiCorpusRoute = createSerpApiCorpusRoute();
const ROUTES = new Map<string, KnowledgeProviderRoute>([
  [`${naverNewsRoute.kind}:${naverNewsRoute.purpose}`, naverNewsRoute],
  [`${naverBlogReferenceRoute.kind}:${naverBlogReferenceRoute.purpose}`, naverBlogReferenceRoute],
  [`${naverShoppingProductRoute.kind}:${naverShoppingProductRoute.purpose}`, naverShoppingProductRoute],
  [`${serpApiCorpusRoute.kind}:${serpApiCorpusRoute.purpose}`, serpApiCorpusRoute],
]);

export function resolveKnowledgeProviderRoute(kind: string, purpose: string) {
  return ROUTES.get(`${kind}:${purpose}`) || null;
}
