# Trends Download UI

WordPress integration assets for the public trends download page.

Preferred integration mode:
- WordPress server-side requests to `apps/trends/trends-api`
- no direct browser-side Supabase service-role usage

## Included Asset

- `trends-download-ui.php`
  A minimal WordPress plugin that:
  - registers `[trends_download_ui]`
  - fetches category/date metadata from `GET /api/v1/trends/meta`
  - submits server-side download requests to `GET /exports/trends.csv`
  - supports `date_from`, `date_to`, and multi-select `category[]`

## Required WordPress Constants

Add these in `wp-config.php` or another secure config layer:

```php
define('BG_TRENDS_API_BASE_URL', 'https://your-trends-api.example.com');
define('BG_TRENDS_API_TOKEN', 'optional-internal-token');
```

## Page Usage

1. Activate the plugin in WordPress.
2. Create a page.
3. Put this shortcode in the page body:

```text
[trends_download_ui]
```

## Current UX Rule

- No category selected = all categories
- Multiple categories selected = repeated `category` query params
- Date fields may be empty for open-ended or full-range exports
