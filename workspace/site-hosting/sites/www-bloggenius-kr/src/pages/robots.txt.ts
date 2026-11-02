import type { APIRoute } from 'astro';
import { publicOrigin, siteData } from '../lib/site.ts';

export const GET: APIRoute = () => new Response(
  `User-agent: *\n${siteData.searchEngineIndexing ? 'Allow: /' : 'Disallow: /'}\nSitemap: ${publicOrigin}/sitemap.xml\n`,
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
);
