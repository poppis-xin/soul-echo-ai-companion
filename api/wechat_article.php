<?php
declare(strict_types=1);

const DEFAULT_WECHAT_TARGET_URL = 'https://ymz.poppis.xin/show.php?id=95879f4cbee64dd4&from=pages.xiaohongshu.com';

function normalize_wechat_target_url(string $url): string
{
    $url = trim(rawurldecode($url));
    if ($url === '') {
        return '';
    }

    $parts = parse_url($url);
    if (!is_array($parts)) {
        return '';
    }

    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower((string) ($parts['host'] ?? ''));
    $path = (string) ($parts['path'] ?? '');

    if ($scheme !== 'https') {
        return '';
    }

    if ($host === 'ymz.poppis.xin') {
        parse_str((string) ($parts['query'] ?? ''), $query);
        $isAllowedShowPage = $path === '/show.php'
            && (string) ($query['id'] ?? '') === '95879f4cbee64dd4'
            && (string) ($query['from'] ?? '') === 'pages.xiaohongshu.com';

        return $isAllowedShowPage ? $url : '';
    }

    if ($host === 'mp.weixin.qq.com' && ($path === '/s' || strpos($path, '/s/') === 0)) {
        return strpos($url, '#') === false ? $url . '#wechat_redirect' : $url;
    }

    return '';
}

$targetUrl = normalize_wechat_target_url((string) ($_GET['url'] ?? DEFAULT_WECHAT_TARGET_URL));
if ($targetUrl === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo '微信入口链接不合法。';
    exit;
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Location: ' . $targetUrl, true, 302);
exit;
