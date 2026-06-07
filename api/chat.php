<?php
declare(strict_types=1);

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_FREE_QUOTA_LIMIT = 10;
const QUOTA_COOKIE = 'love_demo_id';
const QUOTA_TTL = 2592000;
const MAX_MESSAGES = 16;
const MAX_CONTENT_LENGTH = 12000;

function send_json(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_config(): array
{
    $config = [];
    $configPath = __DIR__ . '/config.php';
    if (is_file($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    return $config;
}

function get_api_key(array $config): string
{
    $key = $config['deepseek_api_key'] ?? getenv('DEEPSEEK_API_KEY') ?: '';
    return trim((string) $key);
}

function get_quota_limit(array $config): int
{
    $limit = (int) ($config['free_quota_limit'] ?? getenv('FREE_QUOTA_LIMIT') ?: DEFAULT_FREE_QUOTA_LIMIT);
    return $limit > 0 ? min($limit, 100) : DEFAULT_FREE_QUOTA_LIMIT;
}

function get_client_id(): string
{
    $clientId = $_COOKIE[QUOTA_COOKIE] ?? '';
    if (!is_string($clientId) || !preg_match('/^[a-f0-9]{32}$/', $clientId)) {
        $clientId = bin2hex(random_bytes(16));
    }

    setcookie(QUOTA_COOKIE, $clientId, [
        'expires' => time() + QUOTA_TTL,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    return $clientId;
}

function reserve_quota(string $clientId, int $limit): array
{
    $storageDir = __DIR__ . '/storage';
    if (!is_dir($storageDir) && !mkdir($storageDir, 0750, true) && !is_dir($storageDir)) {
        send_json(500, ['error' => ['message' => '服务器额度存储目录创建失败。']]);
    }

    $file = $storageDir . '/demo-quota.json';
    $handle = fopen($file, 'c+');
    if (!$handle) {
        send_json(500, ['error' => ['message' => '服务器额度存储文件打开失败。']]);
    }

    flock($handle, LOCK_EX);
    rewind($handle);
    $raw = stream_get_contents($handle);
    $records = $raw ? json_decode($raw, true) : [];
    if (!is_array($records)) {
        $records = [];
    }

    $now = time();
    foreach ($records as $key => $record) {
        if (!is_array($record) || (int) ($record['updated_at'] ?? 0) < $now - QUOTA_TTL) {
            unset($records[$key]);
        }
    }

    $quotaKey = hash('sha256', $clientId);
    $record = $records[$quotaKey] ?? ['count' => 0, 'updated_at' => $now];
    $used = (int) ($record['count'] ?? 0);
    if ($used >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        send_json(429, [
            'error' => ['message' => "赠送的 {$limit} 次聊天机会已用完，请在左侧填写自己的 DeepSeek API Key。"],
            'quota' => ['limit' => $limit, 'remaining' => 0],
        ]);
    }

    $used += 1;
    $records[$quotaKey] = ['count' => $used, 'updated_at' => $now];
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($records, JSON_UNESCAPED_UNICODE));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return ['limit' => $limit, 'remaining' => max(0, $limit - $used)];
}

function sanitize_messages($messages): array
{
    if (!is_array($messages) || !$messages) {
        send_json(400, ['error' => ['message' => 'messages 不能为空。']]);
    }

    $safe = [];
    foreach (array_slice($messages, -MAX_MESSAGES) as $message) {
        if (!is_array($message)) {
            continue;
        }
        $role = $message['role'] ?? '';
        $content = $message['content'] ?? '';
        if (!in_array($role, ['system', 'user', 'assistant'], true) || !is_string($content)) {
            continue;
        }
        $safe[] = [
            'role' => $role,
            'content' => function_exists('mb_substr')
                ? mb_substr($content, 0, MAX_CONTENT_LENGTH)
                : substr($content, 0, MAX_CONTENT_LENGTH),
        ];
    }

    if (!$safe || end($safe)['role'] !== 'user') {
        send_json(400, ['error' => ['message' => '最后一条消息必须是用户输入。']]);
    }

    return $safe;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(405, ['error' => ['message' => 'Only POST requests are allowed.']]);
}

$config = read_config();
$apiKey = get_api_key($config);
if ($apiKey === '') {
    send_json(500, ['error' => ['message' => '服务器未配置 DeepSeek API Key。']]);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload)) {
    send_json(400, ['error' => ['message' => '请求体不是有效 JSON。']]);
}

$model = (string) ($payload['model'] ?? 'deepseek-v4-flash');
if (!in_array($model, ['deepseek-v4-flash', 'deepseek-v4-pro'], true)) {
    $model = 'deepseek-v4-flash';
}

$messages = sanitize_messages($payload['messages'] ?? null);
$quota = reserve_quota(get_client_id(), get_quota_limit($config));

ignore_user_abort(true);
set_time_limit(0);

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');
header('X-Free-Quota-Limit: ' . $quota['limit']);
header('X-Free-Quota-Remaining: ' . $quota['remaining']);

$upstreamPayload = json_encode([
    'model' => $model,
    'messages' => $messages,
    'temperature' => 0.82,
    'stream' => true,
], JSON_UNESCAPED_UNICODE);

$upstreamStatus = 0;
$upstreamErrorBody = '';
$ch = curl_init(DEEPSEEK_CHAT_URL);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $upstreamPayload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADER => false,
    CURLOPT_TIMEOUT => 0,
    CURLOPT_HEADERFUNCTION => static function ($curl, string $header) use (&$upstreamStatus): int {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $upstreamStatus = (int) $matches[1];
        }
        return strlen($header);
    },
    CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$upstreamStatus, &$upstreamErrorBody): int {
        if ($upstreamStatus >= 400) {
            $upstreamErrorBody .= $chunk;
            return strlen($chunk);
        }
        echo $chunk;
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
        return strlen($chunk);
    },
]);

$ok = curl_exec($ch);
if ($ok === false) {
    echo "data: " . json_encode([
        'choices' => [[
            'delta' => ['content' => "\n\n服务器代理请求 DeepSeek 失败：" . curl_error($ch)],
            'finish_reason' => null,
            'index' => 0,
        ]],
    ], JSON_UNESCAPED_UNICODE) . "\n\n";
    echo "data: [DONE]\n\n";
} elseif ($upstreamStatus >= 400) {
    $decoded = json_decode($upstreamErrorBody, true);
    $message = $decoded['error']['message'] ?? "服务器代理请求 DeepSeek 失败：HTTP {$upstreamStatus}";
    echo "data: " . json_encode([
        'choices' => [[
            'delta' => ['content' => "\n\n" . $message],
            'finish_reason' => null,
            'index' => 0,
        ]],
    ], JSON_UNESCAPED_UNICODE) . "\n\n";
    echo "data: [DONE]\n\n";
}

curl_close($ch);
