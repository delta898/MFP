import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.BLOGGENIUS_SITE_URL || (process.env.BLOGGENIUS_ENV !== 'production'
    ? 'https://www-dev.bloggenius.kr' : 'https://www.bloggenius.kr'),
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
