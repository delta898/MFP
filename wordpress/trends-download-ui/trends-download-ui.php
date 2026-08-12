<?php
/**
 * Plugin Name: Trends Download UI
 * Description: Server-side WordPress UI for downloading Naver trends exports from the trends API.
 * Version: 0.2.0
 * Author: amadejjs
 */

if (!defined('ABSPATH')) {
    exit;
}

const BG_TRENDS_DOWNLOAD_ACTION = 'bg_trends_download_export';
const BG_TRENDS_SHORTCODE = 'trends_download_ui';
const BG_TRENDS_MAX_CATEGORY_SELECTION = 3;
const BG_TRENDS_ITEMS_PER_CATEGORY = 20;
const BG_TRENDS_PREVIEW_LIMIT = BG_TRENDS_MAX_CATEGORY_SELECTION * BG_TRENDS_ITEMS_PER_CATEGORY;
const BG_TRENDS_META_CACHE_TTL = 600;
const BG_TRENDS_META_STALE_CACHE_TTL = 86400;
const BG_TRENDS_META_REFRESH_LOCK_TTL = 30;
const BG_TRENDS_META_FAILURE_BACKOFF_TTL = 60;
const BG_TRENDS_META_REQUEST_TIMEOUT = 8;
const BG_TRENDS_PREVIEW_REQUEST_TIMEOUT = 10;
const BG_TRENDS_EXPORT_REQUEST_TIMEOUT = 60;

function bg_trends_api_base_url() {
    if (defined('BG_TRENDS_API_BASE_URL') && is_string(BG_TRENDS_API_BASE_URL) && BG_TRENDS_API_BASE_URL !== '') {
        return rtrim(BG_TRENDS_API_BASE_URL, '/');
    }
    return '';
}

function bg_trends_api_request_base_url() {
    if (defined('BG_TRENDS_API_INTERNAL_BASE_URL') && is_string(BG_TRENDS_API_INTERNAL_BASE_URL) && BG_TRENDS_API_INTERNAL_BASE_URL !== '') {
        return rtrim(BG_TRENDS_API_INTERNAL_BASE_URL, '/');
    }
    return bg_trends_api_base_url();
}

function bg_trends_api_token() {
    if (defined('BG_TRENDS_API_TOKEN') && is_string(BG_TRENDS_API_TOKEN) && BG_TRENDS_API_TOKEN !== '') {
        return BG_TRENDS_API_TOKEN;
    }
    return '';
}

function bg_trends_notice_message($code) {
    $messages = array(
        'missing-trend-date' => '날짜를 선택해주세요.',
        'invalid-trend-date' => '날짜 형식이 올바르지 않습니다.',
        'missing-category' => '카테고리를 1개 이상 선택해주세요.',
        'too-many-categories' => '카테고리는 최대 3개까지 선택할 수 있습니다.',
    );
    return isset($messages[$code]) ? $messages[$code] : '';
}

function bg_trends_current_page_url() {
    $request_uri = isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/';
    return home_url($request_uri);
}

function bg_trends_clean_redirect_url($url) {
    return remove_query_arg(array('bg_trends_error', 'trend_date', 'category', 'categories', 'preview'), $url);
}

function bg_trends_request_args($timeout = 30, $accept = 'application/json') {
    $args = array(
        'timeout' => max(1, (int) $timeout),
        'headers' => array(
            'Accept' => $accept,
        ),
    );
    $token = bg_trends_api_token();
    if ($token !== '') {
        $args['headers']['Authorization'] = 'Bearer ' . $token;
    }
    return $args;
}

function bg_trends_meta_cache_key() {
    return 'bg_trends_meta_' . md5(bg_trends_api_request_base_url());
}

function bg_trends_meta_stale_cache_key() {
    return 'bg_trends_meta_stale_' . md5(bg_trends_api_request_base_url());
}

function bg_trends_meta_refresh_lock_key() {
    return 'bg_trends_meta_lock_' . md5(bg_trends_api_request_base_url());
}

function bg_trends_meta_failure_cache_key() {
    return 'bg_trends_meta_failure_' . md5(bg_trends_api_request_base_url());
}

function bg_trends_acquire_meta_refresh_lock() {
    $lock_key = bg_trends_meta_refresh_lock_key();
    $now = time();
    if (add_option($lock_key, $now, '', false)) {
        return true;
    }

    $started_at = (int) get_option($lock_key, 0);
    if ($started_at > 0 && ($now - $started_at) > BG_TRENDS_META_REFRESH_LOCK_TTL) {
        delete_option($lock_key);
        return add_option($lock_key, $now, '', false);
    }
    return false;
}

function bg_trends_release_meta_refresh_lock() {
    delete_option(bg_trends_meta_refresh_lock_key());
}

function bg_trends_meta_error($message) {
    return array(
        'success' => false,
        'message' => $message,
        'categories' => array(),
        'dateRange' => array('min' => '', 'max' => ''),
    );
}

function bg_trends_fetch_meta() {
    $base_url = bg_trends_api_request_base_url();
    if ($base_url === '') {
        return bg_trends_meta_error('BG_TRENDS_API_BASE_URL is not configured.');
    }

    $cache_key = bg_trends_meta_cache_key();
    $stale_cache_key = bg_trends_meta_stale_cache_key();
    $cached = get_transient($cache_key);
    if (is_array($cached) && !empty($cached['success'])) {
        return $cached;
    }

    $stale = get_transient($stale_cache_key);
    $recent_failure = get_transient(bg_trends_meta_failure_cache_key());
    if ($recent_failure !== false) {
        if (is_array($stale) && !empty($stale['success'])) {
            return $stale;
        }
        return bg_trends_meta_error((string) $recent_failure);
    }

    if (!bg_trends_acquire_meta_refresh_lock()) {
        if (is_array($stale) && !empty($stale['success'])) {
            return $stale;
        }
        return bg_trends_meta_error('트렌드 정보를 갱신 중입니다. 잠시 후 다시 시도해주세요.');
    }

    $response = wp_remote_get(
        $base_url . '/api/v1/trends/meta',
        bg_trends_request_args(BG_TRENDS_META_REQUEST_TIMEOUT)
    );
    if (is_wp_error($response)) {
        bg_trends_release_meta_refresh_lock();
        set_transient(
            bg_trends_meta_failure_cache_key(),
            $response->get_error_message(),
            BG_TRENDS_META_FAILURE_BACKOFF_TTL
        );
        if (is_array($stale) && !empty($stale['success'])) {
            return $stale;
        }
        return bg_trends_meta_error($response->get_error_message());
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if ($status_code !== 200 || !is_array($body) || empty($body['success'])) {
        bg_trends_release_meta_refresh_lock();
        $message = is_array($body) && !empty($body['message']) ? $body['message'] : 'Failed to fetch trends metadata.';
        set_transient(
            bg_trends_meta_failure_cache_key(),
            $message,
            BG_TRENDS_META_FAILURE_BACKOFF_TTL
        );
        if (is_array($stale) && !empty($stale['success'])) {
            return $stale;
        }
        return bg_trends_meta_error($message);
    }

    $result = array(
        'success' => true,
        'message' => '',
        'categories' => array_values(array_filter(array_map('strval', isset($body['categories']) && is_array($body['categories']) ? $body['categories'] : array()))),
        'dateRange' => array(
            'min' => isset($body['dateRange']['min']) ? strval($body['dateRange']['min']) : '',
            'max' => isset($body['dateRange']['max']) ? strval($body['dateRange']['max']) : '',
        ),
    );

    set_transient($cache_key, $result, BG_TRENDS_META_CACHE_TTL);
    set_transient($stale_cache_key, $result, BG_TRENDS_META_STALE_CACHE_TTL);
    delete_transient(bg_trends_meta_failure_cache_key());
    bg_trends_release_meta_refresh_lock();
    return $result;
}

function bg_trends_selected_categories_from_request() {
    $raw = isset($_GET['category']) ? wp_unslash($_GET['category']) : array();
    if (!is_array($raw)) {
        $raw = array($raw);
    }

    $selected = array();
    foreach ($raw as $value) {
        $value = trim((string) $value);
        if ($value === '') {
            continue;
        }
        $selected[] = $value;
    }

    return array_values(array_unique($selected));
}

function bg_trends_selected_trend_date_from_request($default_value = '') {
    $trend_date = isset($_GET['trend_date']) ? sanitize_text_field(wp_unslash($_GET['trend_date'])) : '';
    return $trend_date !== '' ? $trend_date : $default_value;
}

function bg_trends_preview_requested_from_request() {
    return isset($_GET['preview']) && sanitize_text_field(wp_unslash($_GET['preview'])) === '1';
}

function bg_trends_validate_selection($trend_date, $categories) {
    if ($trend_date === '') {
        return 'missing-trend-date';
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $trend_date)) {
        return 'invalid-trend-date';
    }
    if (count($categories) === 0) {
        return 'missing-category';
    }
    if (count($categories) > BG_TRENDS_MAX_CATEGORY_SELECTION) {
        return 'too-many-categories';
    }
    return '';
}

function bg_trends_redirect_with_error($error_code, $trend_date, $categories, $redirect_to = '') {
    $target = $redirect_to !== '' ? $redirect_to : wp_get_referer();
    if (!is_string($target) || $target === '') {
        $target = bg_trends_current_page_url();
    }
    $target = bg_trends_clean_redirect_url($target);

    $query = array(
        'bg_trends_error' => $error_code,
    );
    if ($trend_date !== '') {
        $query['trend_date'] = $trend_date;
    }
    if (!empty($categories)) {
        $query['category'] = array_values($categories);
    }

    wp_safe_redirect(add_query_arg($query, $target));
    exit;
}

function bg_trends_fetch_preview($trend_date, $categories, $limit = BG_TRENDS_PREVIEW_LIMIT) {
    $base_url = bg_trends_api_request_base_url();
    if ($base_url === '') {
        return array(
            'success' => false,
            'message' => 'BG_TRENDS_API_BASE_URL is not configured.',
            'items' => array(),
            'count' => 0,
        );
    }

    $query = array(
        'trend_date' => $trend_date,
        'categories' => implode(',', array_values($categories)),
        'limit' => (string) max(1, (int) $limit),
    );

    $response = wp_remote_get(
        add_query_arg($query, $base_url . '/api/v1/trends'),
        bg_trends_request_args(BG_TRENDS_PREVIEW_REQUEST_TIMEOUT)
    );

    if (is_wp_error($response)) {
        return array(
            'success' => false,
            'message' => $response->get_error_message(),
            'items' => array(),
            'count' => 0,
        );
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if ($status_code !== 200 || !is_array($body) || empty($body['success'])) {
        return array(
            'success' => false,
            'message' => is_array($body) && !empty($body['message']) ? $body['message'] : '미리보기를 불러오지 못했습니다.',
            'items' => array(),
            'count' => 0,
        );
    }

    $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : array();
    return array(
        'success' => true,
        'message' => '',
        'items' => $items,
        'count' => isset($body['count']) ? (int) $body['count'] : count($items),
    );
}

function bg_trends_preview_change_modifier_class($item) {
    $change_type = isset($item['change_type']) ? (string) $item['change_type'] : '';
    if ($change_type === '') {
        $raw = isset($item['change_raw']) ? trim((string) $item['change_raw']) : '';
        if ($raw === 'new') {
            $change_type = 'new';
        } elseif (str_starts_with($raw, '▲')) {
            $change_type = 'up';
        } elseif (str_starts_with($raw, '▼')) {
            $change_type = 'down';
        } else {
            $change_type = 'steady';
        }
    }

    if (!in_array($change_type, array('up', 'down', 'new', 'steady'), true)) {
        $change_type = 'steady';
    }

    return 'bg-trends-download-ui__preview-change--' . $change_type;
}

function bg_trends_build_export_url($trend_date, $categories) {
    $query = array();
    if ($trend_date !== '') {
        $query['trend_date'] = $trend_date;
    }
    if (!empty($categories)) {
        $query['categories'] = implode(',', array_values($categories));
    }

    return add_query_arg($query, bg_trends_api_request_base_url() . '/exports/trends.csv');
}

function bg_trends_render_shortcode() {
    $meta = bg_trends_fetch_meta();
    $selected_categories = bg_trends_selected_categories_from_request();
    $trend_date = bg_trends_selected_trend_date_from_request($meta['dateRange']['max']);
    $preview_requested = bg_trends_preview_requested_from_request();
    $selection_error = bg_trends_validate_selection($trend_date, $selected_categories);
    $error_code = isset($_GET['bg_trends_error']) ? sanitize_text_field(wp_unslash($_GET['bg_trends_error'])) : '';
    if ($error_code === '' && $preview_requested && $selection_error !== '') {
        $error_code = $selection_error;
    }
    $notice_message = bg_trends_notice_message($error_code);
    $redirect_to = bg_trends_clean_redirect_url(bg_trends_current_page_url());
    $preview = array(
        'success' => false,
        'message' => '',
        'items' => array(),
        'count' => 0,
    );

    if ($preview_requested && $meta['success'] && $selection_error === '') {
        $preview = bg_trends_fetch_preview($trend_date, $selected_categories, BG_TRENDS_PREVIEW_LIMIT);
        if (!$preview['success'] && $notice_message === '') {
            $notice_message = $preview['message'];
        }
    }

    $button_disabled = (!$meta['success'] || $selection_error !== '');
    $validation_messages = array(
        'missingTrendDate' => bg_trends_notice_message('missing-trend-date'),
        'missingCategory' => bg_trends_notice_message('missing-category'),
        'tooManyCategories' => bg_trends_notice_message('too-many-categories'),
    );

    ob_start();
    ?>
    <div class="bg-trends-download-ui">
        <style>
            .bg-trends-download-ui {
                width: min(100%, 860px);
                margin: 0 auto;
                padding-inline: 4px;
                box-sizing: border-box;
                color: #1f2937;
            }
            .bg-trends-download-ui__form {
                width: 100%;
                box-sizing: border-box;
                padding: 24px 22px 26px;
                border: 1px solid #e3eaf4;
                border-radius: 22px;
                background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
                box-shadow: 0 12px 34px rgba(15, 23, 42, 0.05);
            }
            .bg-trends-download-ui__notice {
                margin-bottom: 16px;
                padding: 12px 14px;
                border-radius: 10px;
                background: #fff5f5;
                border: 1px solid #f3c2c2;
                color: #9d2f2f;
            }
            .bg-trends-download-ui__row { margin-bottom: 20px; }
            .bg-trends-download-ui__row label { display: block; }
            .bg-trends-download-ui__row span {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
            }
            .bg-trends-download-ui__date-field {
                display: flex;
                align-items: center;
                gap: 14px;
            }
            .bg-trends-download-ui__date-field span {
                margin-bottom: 0;
                flex: 0 0 auto;
                color: #111827;
                font-size: 16px;
                font-weight: 700;
            }
            .bg-trends-download-ui__date-field span::after {
                content: ':';
                margin-left: 2px;
            }
            .bg-trends-download-ui__date-field input {
                flex: 0 0 auto;
                min-width: 190px;
                height: 46px;
                padding: 0 14px;
                border: 1px solid #d6dfeb;
                border-radius: 12px;
                background: #ffffff;
                color: #111827;
                font-size: 15px;
                box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.02);
            }
            .bg-trends-download-ui__date-field input:focus {
                outline: none;
                border-color: #7ea1f4;
                box-shadow: 0 0 0 4px rgba(47, 111, 237, 0.12);
            }
            .bg-trends-download-ui__chip-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                padding: 16px;
                border: 1px solid #d9e2ef;
                border-radius: 16px;
                background: #f7f9fc;
            }
            .bg-trends-download-ui__chip {
                appearance: none;
                -webkit-appearance: none;
                border: 1px solid #d0d7e4;
                background: #ffffff;
                color: #49566f;
                border-radius: 999px;
                padding: 10px 16px;
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 15px;
                line-height: 1.2;
                box-shadow: none;
            }
            .bg-trends-download-ui__chip:hover {
                border-color: #9bb5ea;
                background: #eef4ff;
                color: #244aa5;
            }
            .bg-trends-download-ui__chip:focus-visible {
                outline: 2px solid #2f6fed;
                outline-offset: 2px;
            }
            .bg-trends-download-ui__chip.is-selected {
                background: #2f6fed;
                border-color: #2f6fed;
                color: #ffffff;
                box-shadow: 0 8px 18px rgba(47, 111, 237, 0.18);
            }
            .bg-trends-download-ui__chip.is-selected:hover,
            .bg-trends-download-ui__chip.is-selected:focus-visible {
                background: #255bd0;
                border-color: #255bd0;
                color: #ffffff;
            }
            .bg-trends-download-ui__chip.is-disabled {
                opacity: 0.45;
                cursor: not-allowed;
                border-color: #d8dfeb;
                background: #f8fafc;
                color: #91a0b8;
            }
            .bg-trends-download-ui__chip.is-disabled:hover {
                border-color: #d8dfeb;
                background: #f8fafc;
                color: #91a0b8;
            }
            .bg-trends-download-ui__selection-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-top: 10px;
                color: #5a6780;
                font-size: 14px;
            }
            .bg-trends-download-ui__selection-count {
                display: inline-flex;
                align-items: center;
                min-height: 30px;
                padding: 0 10px;
                border-radius: 999px;
                background: #eef4ff;
                color: #315fca;
                font-weight: 700;
            }
            .bg-trends-download-ui__selection-message.is-invalid {
                color: #b42318;
            }
            .bg-trends-download-ui__selection-message:empty {
                display: none;
            }
            .bg-trends-download-ui__hint {
                margin: 0 0 20px;
                color: #5a6780;
                font-size: 14px;
            }
            .bg-trends-download-ui__date-hint {
                margin: 8px 0 0;
                color: #5a6780;
                font-size: 14px;
            }
            .bg-trends-download-ui__actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-bottom: 4px;
            }
            .bg-trends-download-ui__button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-width: 142px;
                min-height: 52px;
                padding: 0 20px;
                border-radius: 14px;
                border: 1px solid transparent;
                cursor: pointer;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: -0.01em;
                transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
            }
            .bg-trends-download-ui__button[disabled] {
                cursor: not-allowed;
                opacity: 0.45;
                box-shadow: none;
            }
            .bg-trends-download-ui__button:not([disabled]):hover {
                transform: translateY(-1px);
            }
            .bg-trends-download-ui__button.is-loading::before {
                content: '';
                width: 14px;
                height: 14px;
                border: 2px solid currentColor;
                border-right-color: transparent;
                border-radius: 999px;
                animation: bg-trends-download-ui-spin 0.7s linear infinite;
            }
            .bg-trends-download-ui__button--secondary {
                background: #eff4ff;
                border-color: #dce7ff;
                color: #2f6fed;
                box-shadow: 0 8px 18px rgba(47, 111, 237, 0.08);
            }
            .bg-trends-download-ui__button--secondary:not([disabled]):hover {
                background: #e7efff;
                border-color: #cadbfd;
                color: #255bd0;
            }
            .bg-trends-download-ui__button--primary {
                background: #4f5563;
                border-color: #4f5563;
                color: #ffffff;
                box-shadow: 0 10px 20px rgba(55, 65, 81, 0.16);
            }
            .bg-trends-download-ui__button--primary:not([disabled]):hover {
                background: #434959;
                border-color: #434959;
            }
            .bg-trends-download-ui__preview {
                width: 100%;
                box-sizing: border-box;
                margin-top: 22px;
                padding: 24px 22px 24px;
                border: 1px solid #e3eaf4;
                border-radius: 22px;
                background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
                box-shadow: 0 12px 34px rgba(15, 23, 42, 0.05);
            }
            .bg-trends-download-ui__preview-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 8px;
            }
            .bg-trends-download-ui__preview-title {
                margin: 0;
                font-size: 22px;
            }
            .bg-trends-download-ui__preview-date {
                display: inline-flex;
                align-items: center;
                padding: 6px 10px;
                border-radius: 999px;
                background: #eef4ff;
                color: #2f6fed;
                font-size: 13px;
                font-weight: 700;
            }
            .bg-trends-download-ui__preview-subtitle {
                margin: 0 0 16px;
                color: #5a6780;
                font-size: 14px;
            }
            .bg-trends-download-ui__preview-empty {
                padding: 14px 16px;
                border-radius: 12px;
                background: #f8fafc;
                color: #5a6780;
            }
            .bg-trends-download-ui__preview-list {
                display: grid;
                gap: 12px;
            }
            .bg-trends-download-ui__preview-item {
                display: grid;
                grid-template-columns: minmax(110px, 140px) 1fr auto;
                gap: 12px;
                align-items: center;
                padding: 14px 16px;
                border: 1px solid #e5e7eb;
                border-radius: 14px;
                background: #ffffff;
            }
            .bg-trends-download-ui__preview-category {
                font-size: 13px;
                font-weight: 600;
                color: #2f6fed;
            }
            .bg-trends-download-ui__preview-keyword {
                color: #1f2937;
                font-weight: 500;
            }
            .bg-trends-download-ui__preview-change {
                font-weight: 700;
                color: #344054;
            }
            .bg-trends-download-ui__preview-change--up,
            .bg-trends-download-ui__preview-change--new {
                color: #d92d20;
            }
            .bg-trends-download-ui__preview-change--down {
                color: #175cd3;
            }
            .bg-trends-download-ui__preview-change--steady {
                color: #101828;
            }
            .bg-trends-download-ui__preview-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: 20px;
            }
            @keyframes bg-trends-download-ui-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @media (max-width: 680px) {
                .bg-trends-download-ui {
                    width: 100%;
                }
                .bg-trends-download-ui__selection-meta,
                .bg-trends-download-ui__actions,
                .bg-trends-download-ui__preview-item {
                    display: block;
                }
                .bg-trends-download-ui__date-field,
                .bg-trends-download-ui__preview-header {
                    display: block;
                }
                .bg-trends-download-ui__preview-date {
                    margin-top: 10px;
                }
                .bg-trends-download-ui__selection-meta > * + *,
                .bg-trends-download-ui__actions > * + *,
                .bg-trends-download-ui__preview-item > * + * {
                    margin-top: 10px;
                }
                .bg-trends-download-ui__button {
                    width: 100%;
                }
            }
        </style>

        <?php if ($notice_message !== '') : ?>
            <div class="bg-trends-download-ui__notice bg-trends-download-ui__notice--error">
                <?php echo esc_html($notice_message); ?>
            </div>
        <?php endif; ?>

        <?php if (!$meta['success']) : ?>
            <div class="bg-trends-download-ui__notice bg-trends-download-ui__notice--error">
                <?php echo esc_html($meta['message']); ?>
            </div>
        <?php endif; ?>

        <form method="get" action="<?php echo esc_url($redirect_to); ?>" class="bg-trends-download-ui__form" data-role="state-form">
            <input type="hidden" name="preview" value="1" />

            <div class="bg-trends-download-ui__row">
                <label class="bg-trends-download-ui__date-field">
                    <span>날짜</span>
                    <input
                        type="date"
                        name="trend_date"
                        value="<?php echo esc_attr($trend_date); ?>"
                        required
                        data-role="trend-date-input"
                    />
                </label>
                <p class="bg-trends-download-ui__date-hint">
                    날짜는 자유롭게 선택할 수 있습니다. 데이터가 없으면 미리보기에서 안내됩니다.
                </p>
            </div>

            <div class="bg-trends-download-ui__row">
                <label class="bg-trends-download-ui__categories">
                    <span>수집 카테고리</span>
                    <div class="bg-trends-download-ui__chip-grid" data-role="category-chip-grid">
                        <?php foreach ($meta['categories'] as $category) : ?>
                            <?php $is_selected = in_array($category, $selected_categories, true); ?>
                            <button
                                type="button"
                                class="bg-trends-download-ui__chip<?php echo $is_selected ? ' is-selected' : ''; ?>"
                                data-role="category-chip"
                                data-category="<?php echo esc_attr($category); ?>"
                                aria-pressed="<?php echo $is_selected ? 'true' : 'false'; ?>"
                            >
                                <?php echo esc_html($category); ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                </label>
                <div class="bg-trends-download-ui__selection-meta">
                    <span class="bg-trends-download-ui__selection-count" data-role="selection-count"></span>
                    <span class="bg-trends-download-ui__selection-message<?php echo $selection_error !== '' ? ' is-invalid' : ''; ?>" data-role="selection-message"></span>
                </div>
            </div>

            <p class="bg-trends-download-ui__hint">
                카테고리는 1개 이상, 최대 <?php echo esc_html((string) BG_TRENDS_MAX_CATEGORY_SELECTION); ?>개까지 선택할 수 있습니다.
            </p>

            <div data-role="state-hidden-inputs"></div>

            <div class="bg-trends-download-ui__actions">
                <button type="submit" class="bg-trends-download-ui__button bg-trends-download-ui__button--secondary" data-role="preview-button" data-default-label="미리보기" data-loading-label="불러오는 중..." <?php disabled($button_disabled); ?>>
                    <span data-role="button-label">미리보기</span>
                </button>
                <button type="button" class="bg-trends-download-ui__button bg-trends-download-ui__button--primary" data-role="download-button" data-default-label="CSV 다운로드" data-loading-label="준비 중..." <?php disabled($button_disabled); ?>>
                    <span data-role="button-label">CSV 다운로드</span>
                </button>
            </div>
        </form>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" data-role="download-form" style="display:none;">
            <input type="hidden" name="action" value="<?php echo esc_attr(BG_TRENDS_DOWNLOAD_ACTION); ?>" />
            <input type="hidden" name="redirect_to" value="<?php echo esc_url($redirect_to); ?>" />
            <input type="hidden" name="trend_date" value="<?php echo esc_attr($trend_date); ?>" data-role="download-trend-date" />
            <?php wp_nonce_field(BG_TRENDS_DOWNLOAD_ACTION, '_wpnonce_bg_trends_download'); ?>
            <div data-role="download-hidden-inputs"></div>
        </form>

        <?php if ($preview_requested && $selection_error === '' && $meta['success']) : ?>
            <div class="bg-trends-download-ui__preview">
                <div class="bg-trends-download-ui__preview-header">
                    <h3 class="bg-trends-download-ui__preview-title">미리보기</h3>
                    <span class="bg-trends-download-ui__preview-date"><?php echo esc_html($trend_date); ?></span>
                </div>
                <p class="bg-trends-download-ui__preview-subtitle">
                    선택한 날짜와 카테고리 기준 최대 <?php echo esc_html((string) BG_TRENDS_PREVIEW_LIMIT); ?>개를 보여줍니다.
                </p>

                <?php if (!$preview['success']) : ?>
                    <div class="bg-trends-download-ui__preview-empty">
                        <?php echo esc_html($preview['message']); ?>
                    </div>
                <?php elseif (empty($preview['items'])) : ?>
                    <div class="bg-trends-download-ui__preview-empty">
                        조건에 맞는 데이터가 없습니다.
                    </div>
                <?php else : ?>
                    <div class="bg-trends-download-ui__preview-list">
                        <?php foreach ($preview['items'] as $item) : ?>
                            <div class="bg-trends-download-ui__preview-item">
                                <div class="bg-trends-download-ui__preview-category">
                                    <?php echo esc_html(isset($item['category']) ? (string) $item['category'] : ''); ?>
                                </div>
                                <div class="bg-trends-download-ui__preview-keyword">
                                    <?php echo esc_html(isset($item['keyword']) ? (string) $item['keyword'] : ''); ?>
                                </div>
                                <div class="bg-trends-download-ui__preview-change <?php echo esc_attr(bg_trends_preview_change_modifier_class($item)); ?>">
                                    <?php echo esc_html(isset($item['change_raw']) ? (string) $item['change_raw'] : ''); ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <div class="bg-trends-download-ui__preview-actions">
                        <button type="button" class="bg-trends-download-ui__button bg-trends-download-ui__button--primary" data-role="download-button" data-default-label="CSV 다운로드" data-loading-label="준비 중..." <?php disabled($button_disabled); ?>>
                            <span data-role="button-label">CSV 다운로드</span>
                        </button>
                    </div>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <script>
            (function() {
                const root = document.currentScript.closest('.bg-trends-download-ui');
                if (!root || root.dataset.enhanced === '1') return;
                root.dataset.enhanced = '1';

                const maxCategories = <?php echo (int) BG_TRENDS_MAX_CATEGORY_SELECTION; ?>;
                const messages = <?php echo wp_json_encode($validation_messages, JSON_UNESCAPED_UNICODE); ?>;
                const chipButtons = Array.from(root.querySelectorAll('[data-role="category-chip"]'));
                const dateInput = root.querySelector('[data-role="trend-date-input"]');
                const previewButton = root.querySelector('[data-role="preview-button"]');
                const downloadButtons = Array.from(root.querySelectorAll('[data-role="download-button"]'));
                const selectionCount = root.querySelector('[data-role="selection-count"]');
                const selectionMessage = root.querySelector('[data-role="selection-message"]');
                const stateHiddenInputs = root.querySelector('[data-role="state-hidden-inputs"]');
                const stateForm = root.querySelector('[data-role="state-form"]');
                const downloadForm = root.querySelector('[data-role="download-form"]');
                const downloadHiddenInputs = root.querySelector('[data-role="download-hidden-inputs"]');
                const downloadTrendDate = root.querySelector('[data-role="download-trend-date"]');

                let transientMessage = '';
                let busyMode = '';
                let downloadResetTimer = null;

                function getSelectedCategories() {
                    return chipButtons
                        .filter((button) => button.classList.contains('is-selected'))
                        .map((button) => button.dataset.category || '');
                }

                function renderHiddenInputs(container, name, values) {
                    while (container.firstChild) {
                        container.removeChild(container.firstChild);
                    }
                    values.forEach((value) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = name;
                        input.value = value;
                        container.appendChild(input);
                    });
                }

                function validateSelection() {
                    const selectedCategories = getSelectedCategories();
                    if (!dateInput.value) {
                        return { valid: false, message: messages.missingTrendDate };
                    }
                    if (selectedCategories.length === 0) {
                        return { valid: false, message: messages.missingCategory };
                    }
                    if (selectedCategories.length > maxCategories) {
                        return { valid: false, message: messages.tooManyCategories };
                    }
                    return { valid: true, message: '' };
                }

                function isBusy() {
                    return busyMode !== '';
                }

                function applyButtonState(button, loading) {
                    const label = button.querySelector('[data-role="button-label"]');
                    const defaultLabel = button.dataset.defaultLabel || (label ? label.textContent : '');
                    const loadingLabel = button.dataset.loadingLabel || defaultLabel;
                    button.classList.toggle('is-loading', loading);
                    button.setAttribute('aria-busy', loading ? 'true' : 'false');
                    if (label) {
                        label.textContent = loading ? loadingLabel : defaultLabel;
                    }
                }

                function setBusyState(mode) {
                    busyMode = mode;
                    if (downloadResetTimer) {
                        window.clearTimeout(downloadResetTimer);
                        downloadResetTimer = null;
                    }
                    updateUi();
                }

                function clearBusyState() {
                    busyMode = '';
                    updateUi();
                }

                function updateUi() {
                    const selectedCategories = getSelectedCategories();
                    const maxReached = selectedCategories.length >= maxCategories;
                    const validation = validateSelection();
                    const busyMessage = busyMode === 'preview'
                        ? '미리보기를 불러오는 중입니다...'
                        : (busyMode === 'download' ? 'CSV 파일을 준비하는 중입니다...' : '');

                    renderHiddenInputs(stateHiddenInputs, 'category[]', selectedCategories);
                    renderHiddenInputs(downloadHiddenInputs, 'category[]', selectedCategories);
                    downloadTrendDate.value = dateInput.value;
                    // A disabled control is excluded from GET form submission.
                    // Keep the selected trend_date successful while the preview
                    // request is being submitted; the action buttons and category
                    // chips already prevent duplicate work.
                    dateInput.setAttribute('aria-busy', isBusy() ? 'true' : 'false');

                    chipButtons.forEach((button) => {
                        const selected = button.classList.contains('is-selected');
                        const shouldDisable = isBusy() || (!selected && maxReached);
                        button.classList.toggle('is-disabled', shouldDisable);
                        button.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
                        button.disabled = shouldDisable;
                    });

                    selectionCount.textContent = `${selectedCategories.length} / ${maxCategories} 선택됨`;
                    selectionMessage.textContent = transientMessage || busyMessage || validation.message;
                    selectionMessage.classList.toggle('is-invalid', transientMessage !== '' || (!validation.valid && busyMessage === ''));

                    previewButton.disabled = isBusy() || !validation.valid;
                    applyButtonState(previewButton, busyMode === 'preview');
                    downloadButtons.forEach((button) => {
                        button.disabled = isBusy() || !validation.valid;
                        applyButtonState(button, busyMode === 'download');
                    });
                }

                chipButtons.forEach((button) => {
                    button.addEventListener('click', () => {
                        const isSelected = button.classList.contains('is-selected');
                        if (button.classList.contains('is-disabled') && !isSelected) {
                            transientMessage = messages.tooManyCategories;
                            updateUi();
                            return;
                        }
                        if (!isSelected && getSelectedCategories().length >= maxCategories) {
                            transientMessage = messages.tooManyCategories;
                            updateUi();
                            return;
                        }

                        transientMessage = '';
                        button.classList.toggle('is-selected');
                        button.setAttribute('aria-pressed', button.classList.contains('is-selected') ? 'true' : 'false');
                        updateUi();
                    });
                });

                dateInput.addEventListener('input', () => {
                    transientMessage = '';
                    updateUi();
                });

                stateForm.addEventListener('submit', (event) => {
                    const validation = validateSelection();
                    if (!validation.valid) {
                        event.preventDefault();
                        transientMessage = validation.message;
                        updateUi();
                        return;
                    }
                    transientMessage = '';
                    setBusyState('preview');
                });

                downloadButtons.forEach((button) => {
                    button.addEventListener('click', () => {
                        const validation = validateSelection();
                        if (!validation.valid) {
                            transientMessage = validation.message;
                            updateUi();
                            return;
                        }
                        transientMessage = '';
                        setBusyState('download');
                        downloadResetTimer = window.setTimeout(() => {
                            clearBusyState();
                        }, 4500);
                        downloadForm.submit();
                    });
                });

                updateUi();
            })();
        </script>
    </div>
    <?php
    return ob_get_clean();
}

function bg_trends_handle_download() {
    if (!isset($_POST['_wpnonce_bg_trends_download']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['_wpnonce_bg_trends_download'])), BG_TRENDS_DOWNLOAD_ACTION)) {
        wp_die('잘못된 요청입니다.', 'Trends Download', array('response' => 403));
    }

    $base_url = bg_trends_api_request_base_url();
    if ($base_url === '') {
        wp_die('BG_TRENDS_API_BASE_URL is not configured.', 'Trends Download', array('response' => 500));
    }

    $redirect_to = isset($_POST['redirect_to']) ? esc_url_raw(wp_unslash($_POST['redirect_to'])) : '';
    $trend_date = isset($_POST['trend_date']) ? sanitize_text_field(wp_unslash($_POST['trend_date'])) : '';
    $categories = isset($_POST['category']) ? wp_unslash($_POST['category']) : array();
    if (!is_array($categories)) {
        $categories = array($categories);
    }
    $categories = array_values(array_filter(array_map(static function ($value) {
        return trim((string) $value);
    }, $categories)));

    $validation_error = bg_trends_validate_selection($trend_date, $categories);
    if ($validation_error !== '') {
        bg_trends_redirect_with_error($validation_error, $trend_date, $categories, $redirect_to);
    }

    $response = wp_remote_get(bg_trends_build_export_url($trend_date, $categories), array(
        'timeout' => BG_TRENDS_EXPORT_REQUEST_TIMEOUT,
        'headers' => bg_trends_request_args()['headers'],
    ));

    if (is_wp_error($response)) {
        wp_die($response->get_error_message(), 'Trends Download', array('response' => 502));
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    if ($status_code !== 200) {
        wp_die($body !== '' ? $body : 'Failed to download trends export.', 'Trends Download', array('response' => $status_code));
    }

    $content_type = wp_remote_retrieve_header($response, 'content-type');
    $content_disposition = wp_remote_retrieve_header($response, 'content-disposition');

    if ($content_type !== '') {
        header('Content-Type: ' . $content_type);
    } else {
        header('Content-Type: text/csv; charset=utf-8');
    }
    if ($content_disposition !== '') {
        header('Content-Disposition: ' . $content_disposition);
    } else {
        header('Content-Disposition: attachment; filename="naver-trends.csv"');
    }
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo $body;
    exit;
}

add_shortcode(BG_TRENDS_SHORTCODE, 'bg_trends_render_shortcode');
add_action('admin_post_' . BG_TRENDS_DOWNLOAD_ACTION, 'bg_trends_handle_download');
add_action('admin_post_nopriv_' . BG_TRENDS_DOWNLOAD_ACTION, 'bg_trends_handle_download');
