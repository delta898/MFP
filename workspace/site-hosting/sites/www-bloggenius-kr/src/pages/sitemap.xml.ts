import type { APIRoute } from 'astro';
import { navigationItems, legalNavigation, publicOrigin } from '../lib/site.ts';

export const GET: APIRoute = () => {
  const paths = [...navigationItems.map((item) => item.path), ...legalNavigation.map((item) => item.path)];
  const urls = [...new Set(paths)].map((path) => `<url><loc>${new URL(path, publicOrigin).toString()}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
