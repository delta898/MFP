import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.resolve(process.env.GARDEN_BUNDLE_DIR || path.join(root, 'bundle'));

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  publicDir: path.join(bundleDir, 'public'),
});
