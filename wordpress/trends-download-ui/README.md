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
  - renders category chips instead of a raw multi-select box
  - shows a preview section from `GET /api/v1/trends`
  - submits server-side download requests to `GET /exports/trends.csv`
  - uses a single `trend_date` input
  - enforces category selection between 1 and 3 items

## Required WordPress Constants

Add these in `wp-config.php` or another secure config layer:

```php
define('BG_TRENDS_API_BASE_URL', 'https://your-trends-api.example.com');
define('BG_TRENDS_API_TOKEN', 'optional-internal-token');
```

## Docker Note

If WordPress runs inside Docker:
- `http://127.0.0.1:4581` points to the container itself, not the host Node service
- use a host-reachable address or a reverse-proxied HTTPS URL instead
- if calling a host-side `trends-api` directly, the host may need an `iptables` INPUT rule allowing Docker bridge traffic to TCP `4581`

Example host-side bind for that case:

```env
TRENDS_API_HOST=0.0.0.0
```

## Page Usage

1. Activate the plugin in WordPress.
2. Create a page.
3. Put this shortcode in the page body:

```text
[trends_download_ui]
```

## Current UX Rule

- Date is a single-day selection
- The UI defaults the date to the latest available trend date
- Users can choose any date; if no data exists, the preview shows an empty-state message
- Category selection uses toggle chips
- Category selection is required
- Category selection is limited to 3 items
- Preview and download buttons are disabled until the selection is valid
- The preview header shows the selected date
- Preview rows colorize change markers: `up/new` red, `down` blue, `steady` dark
- The preview section includes a second CSV download button at the bottom
- Preview and download actions show a lightweight loading state
- Preview shows up to 60 rows for the selected date and categories
- The API remains more flexible than the public WordPress UI
