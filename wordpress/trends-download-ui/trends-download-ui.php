<?php
/**
 * Plugin Name: Trends Download UI
 * Description: Server-side WordPress UI for downloading Naver trends exports from the trends API.
 * Version: 0.1.0
 * Author: amadejjs
 */

if (!defined('ABSPATH')) {
    exit;
}

const BG_TRENDS_DOWNLOAD_ACTION = 'bg_trends_download_export';
const BG_TRENDS_SHORTCODE = 'trends_download_ui';

function bg_trends_api_base_url() {
    if (defined('BG_TRENDS_API_BASE_URL') && is_string(BG_TRENDS_API_BASE_URL) && BG_TRENDS_API_BASE_URL !== '') {
        return rtrim(BG_TRENDS_API_BASE_URL, '/');
    }
    return '';
}

function bg_trends_api_token() {
    if (defined('BG_TRENDS_API_TOKEN') && is_string(BG_TRENDS_API_TOKEN) && BG_TRENDS_API_TOKEN !== '') {
        return BG_TRENDS_API_TOKEN;
    }
    return '';
}

function bg_trends_request_args() {
    $args = array(
        'timeout' => 30,
        'headers' => array(
            'Accept' => 'application/json',
        ),
    );
    $token = bg_trends_api_token();
    if ($token !== '') {
        $args['headers']['Authorization'] = 'Bearer ' . $token;
    }
    return $args;
}

function bg_trends_fetch_meta() {
    $base_url = bg_trends_api_base_url();
    if ($base_url === '') {
        return array(
            'success' => false,
            'message' => 'BG_TRENDS_API_BASE_URL is not configured.',
            'categories' => array(),
            'dateRange' => array('min' => '', 'max' => ''),
        );
    }

    $response = wp_remote_get($base_url . '/api/v1/trends/meta', bg_trends_request_args());
    if (is_wp_error($response)) {
        return array(
            'success' => false,
            'message' => $response->get_error_message(),
            'categories' => array(),
            'dateRange' => array('min' => '', 'max' => ''),
        );
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if ($status_code !== 200 || !is_array($body) || empty($body['success'])) {
        return array(
            'success' => false,
            'message' => is_array($body) && !empty($body['message']) ? $body['message'] : 'Failed to fetch trends metadata.',
            'categories' => array(),
            'dateRange' => array('min' => '', 'max' => ''),
        );
    }

    return array(
        'success' => true,
        'message' => '',
        'categories' => array_values(array_filter(array_map('strval', isset($body['categories']) && is_array($body['categories']) ? $body['categories'] : array()))),
        'dateRange' => array(
            'min' => isset($body['dateRange']['min']) ? strval($body['dateRange']['min']) : '',
            'max' => isset($body['dateRange']['max']) ? strval($body['dateRange']['max']) : '',
        ),
    );
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
        $lower = strtolower($value);
        if ($lower === 'all' || $value === '*') {
            return array();
        }
        $selected[] = $value;
    }

    return array_values(array_unique($selected));
}

function bg_trends_render_shortcode() {
    $meta = bg_trends_fetch_meta();
    $selected_categories = bg_trends_selected_categories_from_request();
    $date_from = isset($_GET['date_from']) ? sanitize_text_field(wp_unslash($_GET['date_from'])) : '';
    $date_to = isset($_GET['date_to']) ? sanitize_text_field(wp_unslash($_GET['date_to'])) : '';

    ob_start();
    ?>
    <div class="bg-trends-download-ui">
        <?php if (!$meta['success']) : ?>
            <div class="bg-trends-download-ui__notice bg-trends-download-ui__notice--error">
                <?php echo esc_html($meta['message']); ?>
            </div>
        <?php endif; ?>

        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="bg-trends-download-ui__form">
            <input type="hidden" name="action" value="<?php echo esc_attr(BG_TRENDS_DOWNLOAD_ACTION); ?>" />
            <?php wp_nonce_field(BG_TRENDS_DOWNLOAD_ACTION, '_wpnonce_bg_trends_download'); ?>

            <div class="bg-trends-download-ui__row">
                <label>
                    <span>시작일</span>
                    <input type="date" name="date_from" value="<?php echo esc_attr($date_from); ?>" min="<?php echo esc_attr($meta['dateRange']['min']); ?>" max="<?php echo esc_attr($meta['dateRange']['max']); ?>" />
                </label>
                <label>
                    <span>종료일</span>
                    <input type="date" name="date_to" value="<?php echo esc_attr($date_to); ?>" min="<?php echo esc_attr($meta['dateRange']['min']); ?>" max="<?php echo esc_attr($meta['dateRange']['max']); ?>" />
                </label>
            </div>

            <div class="bg-trends-download-ui__row">
                <label class="bg-trends-download-ui__categories">
                    <span>카테고리</span>
                    <select name="category[]" multiple size="10">
                        <?php foreach ($meta['categories'] as $category) : ?>
                            <option value="<?php echo esc_attr($category); ?>" <?php selected(in_array($category, $selected_categories, true)); ?>>
                                <?php echo esc_html($category); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </label>
            </div>

            <p class="bg-trends-download-ui__hint">
                카테고리를 선택하지 않으면 전체 카테고리로 다운로드합니다. 여러 개를 선택하려면 Ctrl 또는 Cmd 키를 함께 사용하세요.
            </p>

            <div class="bg-trends-download-ui__actions">
                <button type="submit">CSV 다운로드</button>
            </div>
        </form>
    </div>
    <?php
    return ob_get_clean();
}

function bg_trends_build_export_url($date_from, $date_to, $categories) {
    $query = array();
    if ($date_from !== '') {
        $query['date_from'] = $date_from;
    }
    if ($date_to !== '') {
        $query['date_to'] = $date_to;
    }
    if (!empty($categories)) {
        $query['category'] = array_values($categories);
    }

    return add_query_arg($query, bg_trends_api_base_url() . '/exports/trends.csv');
}

function bg_trends_handle_download() {
    if (!isset($_POST['_wpnonce_bg_trends_download']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['_wpnonce_bg_trends_download'])), BG_TRENDS_DOWNLOAD_ACTION)) {
        wp_die('잘못된 요청입니다.', 'Trends Download', array('response' => 403));
    }

    $base_url = bg_trends_api_base_url();
    if ($base_url === '') {
        wp_die('BG_TRENDS_API_BASE_URL is not configured.', 'Trends Download', array('response' => 500));
    }

    $date_from = isset($_POST['date_from']) ? sanitize_text_field(wp_unslash($_POST['date_from'])) : '';
    $date_to = isset($_POST['date_to']) ? sanitize_text_field(wp_unslash($_POST['date_to'])) : '';
    $categories = isset($_POST['category']) ? wp_unslash($_POST['category']) : array();
    if (!is_array($categories)) {
        $categories = array($categories);
    }
    $categories = array_values(array_filter(array_map(static function ($value) {
        return trim((string) $value);
    }, $categories)));

    $response = wp_remote_get(bg_trends_build_export_url($date_from, $date_to, $categories), array(
        'timeout' => 60,
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
