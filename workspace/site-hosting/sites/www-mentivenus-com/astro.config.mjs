import { defineConfig } from 'astro/config';

const environment = process.env.MENTIVENUS_ENV === 'production' ? 'production' : 'development';
const defaultSiteUrl = environment === 'production'
  ? 'https://www.mentivenus.com'
  : 'https://www-dev.mentivenus.com';

export default defineConfig({
  site: process.env.MENTIVENUS_SITE_URL || defaultSiteUrl,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
