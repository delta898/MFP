import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import path from 'node:path';

const bundleDir = path.resolve(process.env.GARDEN_BUNDLE_DIR || './bundle');

const knowledge = defineCollection({
  loader: glob({ pattern: '**/*.md', base: path.join(bundleDir, 'knowledge/notes') }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: path.join(bundleDir, 'blog') }),
});

export const collections = { knowledge, blog };
