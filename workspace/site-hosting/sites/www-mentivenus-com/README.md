# MentiVenus company site

Astro static company homepage. `dev` pushes build and deploy to `www-dev.mentivenus.com`; `release/*` pushes build and deploy to `www.mentivenus.com`.

```sh
npm ci
npm run dev
npm run build
```

Set `MENTIVENUS_ENV=development|production` to choose the matching default canonical origin. `MENTIVENUS_SITE_URL` can override it for local preview/builds.
