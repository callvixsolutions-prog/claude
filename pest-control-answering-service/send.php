<?php
/*
 * Lead endpoint for the Callvix Solutions landing page (/pest-control-answering-service/).
 *
 * Adapted from the PestMaster landing page's send.php (pmnaperville.com), which runs on the
 * same Hostinger server. The page posts a lead here; this script checks it and emails it to
 * Chris's mailbox from this website's own server with PHP mail(). No third-party form
 * service, nothing stored on the server, no personal data written to any log, and no
 * passwords or keys in this file.
 *
 * Two ways in:
 *   - the page's script sends JSON (Content-Type: application/json) and gets JSON back:
 *     {"ok": true} only when the email was handed to the mail system;
 *   - without JavaScript the plain HTML form posts here and gets a short HTML page back.
 *
 * Spam protection: allowed origin only, a hidden honeypot field, a minimum time on the form
 * (when the page's script reports it), server-side validation of every field, and at most
 * CVX_MAX_PER_HOUR requests per visitor address per hour.
 *
 * Meta Conversions API (27 Oct 2026): after the visitor has their answer, an accepted lead is also sent to Meta
 * from this server as a "Lead" event with the page's event_id (so Meta counts it once with the browser pixel) and
 * the contact details hashed with SHA-256, as Meta requires. The pixel ID and access token live ONLY in
 * callvix-config.php on the server, in the folder above public_html (see CVX_CONFIG_FILE); never in this file or
 * the repository. Without that file, or with empty values, nothing is sent to Meta.
 */
declare(strict_types=1);

const CVX_ALLOWED_ORIGINS = ['https://callvixsolutions.com'];
const CVX_FROM_NAME = 'Callvix Solutions Website';
const CVX_FROM_ADDRESS = 'noreply@callvixsolutions.com';
const CVX_SUBJECT_PREFIX = 'New landing page lead: ';
const CVX_MAX_PER_HOUR = 5;
const CVX_MIN_MS_ON_FORM = 3000;
const CVX_MAX_BODY_BYTES = 20000;
const CVX_PAGE_PREFIX = 'https://callvixsolutions.com/';
const CVX_TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
const CVX_CONFIG_FILE = 'callvix-config.php';               // two folders up: next to public_html, out of the web's reach
const CVX_META_GRAPH = 'https://graph.facebook.com/v23.0/';
const CVX_META_TIMEOUT_S = 5;

// Cloudflare's published ranges (copied from the PestMaster endpoint, 17 Oct 2026). Only used
// if the site is ever put behind Cloudflare's proxy; otherwise REMOTE_ADDR is the visitor.
const CVX_CLOUDFLARE_RANGES = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];

// The recipient lives here only, never in the page. Owner decision 27 Oct 2026: leads go to Chris
// (sales@callvixsolutions.com did not receive the first test lead).
function cvx_recipient(): string
{
    return 'chris' . '@' . 'callvixsupport.com';
}

function cvx_wants_json(): bool
{
    return stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === 0;
}

function cvx_respond(int $status, array $body): void
{
    cvx_output($status, $body);
    exit;
}

// Writes the answer without ending the script (used when work continues after the visitor has their answer).
function cvx_output(int $status, array $body): void
{
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow, noarchive, noimageindex');
    if (cvx_wants_json()) {
        header('Content-Type: application/json');
        echo json_encode($body);
        return;
    }
    // Plain form post (no JavaScript): a short page in plain words.
    header('Content-Type: text/html; charset=UTF-8');
    $ok = ($body['ok'] ?? false) === true;
    $title = $ok ? 'Thanks. We have your details.' : 'Sorry, that didn’t go through.';
    $text = $ok
        ? 'We’ll call you shortly during U.S. business hours to arrange your 20-minute call.'
        : (($body['error'] ?? '') === 'invalid'
            ? 'Please go back and check your name, business name, 10-digit U.S. mobile number and email.'
            : 'Please go back and try again in a few minutes.');
    echo '<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>' . htmlspecialchars($title) . ' | Callvix Solutions</title>'
        . '<style>body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0E1A2F;background:#F3F6FA}'
        . 'main{max-width:560px;margin:12vh auto;padding:32px 24px;background:#fff;border-radius:16px}h1{font-size:26px;line-height:1.25;margin:0 0 12px}'
        . 'a{color:#0A7C82;font-weight:600}</style></head><body><main><h1>' . htmlspecialchars($title) . '</h1><p>' . htmlspecialchars($text) . '</p>'
        . '<p><a href="/pest-control-answering-service/">Back to the page</a></p></main></body></html>';
}

// Server-only settings (Meta pixel ID, Conversions API token, optional test code). Returns [] when absent.
function cvx_config(): array
{
    $file = dirname(__DIR__, 2) . '/' . CVX_CONFIG_FILE;
    if (!is_file($file)) {
        return [];
    }
    $config = include $file;
    return is_array($config) ? $config : [];
}

function cvx_hash(string $value): string
{
    return hash('sha256', $value);
}

// One "Lead" event to Meta's Conversions API. True only when Meta reports the event received.
function cvx_meta_lead(array $config, array $lead): bool
{
    $pixel = is_string($config['meta_pixel_id'] ?? null) ? trim($config['meta_pixel_id']) : '';
    $token = is_string($config['meta_capi_token'] ?? null) ? trim($config['meta_capi_token']) : '';
    if (preg_match('/^\d{6,20}$/', $pixel) !== 1 || $token === '' || !function_exists('curl_init')) {
        return false;
    }
    $names = preg_split('/\s+/u', function_exists('mb_strtolower') ? mb_strtolower($lead['name'], 'UTF-8') : strtolower($lead['name'])) ?: [];
    $userData = [
        'em' => [cvx_hash(strtolower($lead['email']))],
        'ph' => [cvx_hash('1' . $lead['phone'])],
        'country' => [cvx_hash('us')],
        'client_ip_address' => $lead['ip'],
        'client_user_agent' => $lead['ua'],
    ];
    if (count($names) >= 1 && $names[0] !== '') {
        $userData['fn'] = [cvx_hash($names[0])];
    }
    if (count($names) >= 2) {
        $userData['ln'] = [cvx_hash((string) end($names))];
    }
    if ($lead['fbp'] !== '') {
        $userData['fbp'] = $lead['fbp'];
    }
    if ($lead['fbc'] !== '') {
        $userData['fbc'] = $lead['fbc'];
    }
    $body = [
        'data' => [[
            'event_name' => 'Lead',
            'event_time' => time(),
            'event_id' => $lead['event_id'],
            'action_source' => 'website',
            'event_source_url' => $lead['page_url'],
            'user_data' => $userData,
            'custom_data' => ['content_name' => 'Landing page form'],
        ]],
        'access_token' => $token,
    ];
    $test = is_string($config['meta_test_event_code'] ?? null) ? trim($config['meta_test_event_code']) : '';
    if ($test !== '') {
        $body['test_event_code'] = $test;
    }
    $handle = curl_init(CVX_META_GRAPH . $pixel . '/events');
    if ($handle === false) {
        return false;
    }
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => CVX_META_TIMEOUT_S,
    ]);
    $answer = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    $json = is_string($answer) ? json_decode($answer, true) : null;
    return $status === 200 && is_array($json) && (int) ($json['events_received'] ?? 0) >= 1;
}

// One line of plain text: no control characters (so no header injection), trimmed, capped.
function cvx_line($value, int $max): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $value);
    if ($text === null) {
        return '';
    }
    $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max);
}

function cvx_length(string $text): int
{
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function cvx_ip_in_range(string $ip, string $cidr): bool
{
    [$network, $bits] = explode('/', $cidr) + [1 => ''];
    $address = @inet_pton($ip);
    $base = @inet_pton($network);
    if ($address === false || $base === false || strlen($address) !== strlen($base) || !ctype_digit($bits)) {
        return false;
    }
    $bits = (int) $bits;
    $whole = intdiv($bits, 8);
    if (substr($address, 0, $whole) !== substr($base, 0, $whole)) {
        return false;
    }
    $rest = $bits % 8;
    if ($rest === 0) {
        return true;
    }
    $mask = chr((0xFF << (8 - $rest)) & 0xFF);
    return ($address[$whole] & $mask) === ($base[$whole] & $mask);
}

function cvx_client_ip(): string
{
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $forwarded = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
    if ($forwarded !== '' && filter_var($forwarded, FILTER_VALIDATE_IP) !== false) {
        foreach (CVX_CLOUDFLARE_RANGES as $range) {
            if (cvx_ip_in_range($remote, $range)) {
                return $forwarded;
            }
        }
    }
    return $remote !== '' ? $remote : 'unknown';
}

// At most CVX_MAX_PER_HOUR requests per address per hour. The counter is a small file in the
// system temp folder (never the public folder), named by a hash of the address and holding
// timestamps only. If the temp folder can't be used, the limit is skipped rather than
// blocking real visitors.
function cvx_rate_limited(string $ip): bool
{
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/cvx_rl_' . hash('sha256', 'cvx-lead|' . $ip) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return false;
    }
    $limited = false;
    if (flock($handle, LOCK_EX)) {
        $raw = stream_get_contents($handle);
        $times = json_decode($raw === false || $raw === '' ? '[]' : $raw, true);
        if (!is_array($times)) {
            $times = [];
        }
        $now = time();
        $recent = [];
        foreach ($times as $time) {
            if (is_int($time) && $time > $now - 3600) {
                $recent[] = $time;
            }
        }
        if (count($recent) >= CVX_MAX_PER_HOUR) {
            $limited = true;
        } else {
            $recent[] = $now;
        }
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($recent));
        fflush($handle);
        flock($handle, LOCK_UN);
    }
    fclose($handle);
    return $limited;
}

// The single place that sends email. To move to SMTP later, replace this body only; any
// password must be placed on the server by the site owner, never in this repository.
function cvx_send_mail(string $to, string $subject, string $body, string $replyTo): bool
{
    $headers = [
        'From: "' . CVX_FROM_NAME . '" <' . CVX_FROM_ADDRESS . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    if ($replyTo !== '') {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    // Same call as the PestMaster endpoint on this server, whose delivery was confirmed.
    return @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
}

/* ---------- request checks ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    cvx_respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

// Origin (sent by every current browser on a POST). Older browsers: fall back to the Referer.
$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim((string) $_SERVER['HTTP_ORIGIN'], '/') : '';
if ($origin === '') {
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    $parts = parse_url($referer);
    if (is_array($parts) && isset($parts['scheme'], $parts['host'])) {
        $origin = $parts['scheme'] . '://' . $parts['host'];
    }
}
if (!in_array($origin, CVX_ALLOWED_ORIGINS, true)) {
    cvx_respond(403, ['ok' => false, 'error' => 'forbidden_origin']);
}

if (cvx_wants_json()) {
    $raw = file_get_contents('php://input', false, null, 0, CVX_MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > CVX_MAX_BODY_BYTES) {
        cvx_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => ['body']]);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        cvx_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => ['body']]);
    }
} else {
    $data = $_POST;
}

if (cvx_rate_limited(cvx_client_ip())) {
    header('Retry-After: 3600');
    cvx_respond(429, ['ok' => false, 'error' => 'rate_limited']);
}

// Spam: a filled honeypot, or (when the page's script reports it) a form sent faster than a
// person can fill it in. Without JavaScript there is no timer; the other checks still apply.
$honeypot = isset($data['website']) && is_scalar($data['website']) ? trim((string) $data['website']) : '';
$elapsed = isset($data['elapsed_ms']) && is_numeric($data['elapsed_ms']) ? (int) $data['elapsed_ms'] : null;
if ($honeypot !== '' || ($elapsed !== null && $elapsed < CVX_MIN_MS_ON_FORM) || (cvx_wants_json() && $elapsed === null)) {
    cvx_respond(400, ['ok' => false, 'error' => 'rejected']);
}

/* ---------- validation ---------- */

$name = cvx_line($data['name'] ?? '', 200);
$business = cvx_line($data['business'] ?? '', 200);
$email = cvx_line($data['email'] ?? '', 200);
$phoneDigits = preg_replace('/\D+/', '', (string) (is_scalar($data['phone'] ?? null) ? $data['phone'] : '')) ?? '';
if (strlen($phoneDigits) === 11 && $phoneDigits[0] === '1') {
    $phoneDigits = substr($phoneDigits, 1);
}
$pageUrl = cvx_line($data['page_url'] ?? '', 500);

$invalid = [];
if (cvx_length($name) < 2 || cvx_length($name) > 80) {
    $invalid[] = 'name';
}
if (cvx_length($business) < 2 || cvx_length($business) > 120) {
    $invalid[] = 'business';
}
// U.S. numbers: 10 digits, area code and exchange can't start with 0 or 1.
if (preg_match('/^[2-9]\d{2}[2-9]\d{6}$/', $phoneDigits) !== 1) {
    $invalid[] = 'phone';
}
if (strlen($email) > 120 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $invalid[] = 'email';
}
if ($pageUrl !== '' && strpos($pageUrl, CVX_PAGE_PREFIX) !== 0) {
    $invalid[] = 'page_url';
}
$tracking = [];
foreach (CVX_TRACKING_KEYS as $key) {
    // Cleaned to one short line, never rejected: an odd campaign tag must not lose a lead.
    $tracking[$key] = cvx_line($data[$key] ?? '', 300);
}
if ($invalid !== []) {
    cvx_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => $invalid]);
}

/* ---------- the email ---------- */

$phoneDisplay = '(' . substr($phoneDigits, 0, 3) . ') ' . substr($phoneDigits, 3, 3) . '-' . substr($phoneDigits, 6);
$when = (new DateTimeImmutable('now', new DateTimeZone('America/New_York')))->format('D, M j, Y g:i A T');
$lines = [
    'Name: ' . $name,
    'Business: ' . $business,
    'Phone: ' . $phoneDisplay . '  (+1' . $phoneDigits . ')',
    'Email: ' . $email,
    'Submitted: ' . $when,
    'Page URL: ' . ($pageUrl !== '' ? $pageUrl : '(not sent)'),
    '',
];
foreach ($tracking as $key => $value) {
    $lines[] = $key . ': ' . ($value !== '' ? $value : '(none)');
}
$lines[] = '';
$lines[] = 'Reply to this email to write to the lead directly.';

$sent = cvx_send_mail(cvx_recipient(), CVX_SUBJECT_PREFIX . $business, implode("\r\n", $lines) . "\r\n", $email);
if ($sent !== true) {
    error_log('cvx-lead: send_failed');
    cvx_respond(500, ['ok' => false, 'error' => 'send_failed']);
}

// The visitor gets the answer now; Meta is told afterwards, so a slow Meta never delays the page.
cvx_output(200, ['ok' => true]);
if (function_exists('litespeed_finish_request')) {
    litespeed_finish_request();
} elseif (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

$config = cvx_config();
if ($config !== []) {
    $eventId = cvx_line($data['event_id'] ?? '', 40);
    if (preg_match('/^lead\.[a-z0-9]{6,12}\.[a-z0-9]{1,8}$/', $eventId) !== 1) {
        $eventId = 'lead.srv.' . bin2hex(random_bytes(4));
    }
    $fbp = cvx_line($_COOKIE['_fbp'] ?? '', 100);
    $fbc = cvx_line($_COOKIE['_fbc'] ?? '', 300);
    if (preg_match('/^fb\.\d\.\d+\.\d+$/', $fbp) !== 1) {
        $fbp = '';
    }
    if (preg_match('/^fb\.\d\.\d+\.[\w\-]+$/', $fbc) !== 1) {
        $fbc = $tracking['fbclid'] !== '' && preg_match('/^[\w\-]+$/', $tracking['fbclid']) === 1
            ? 'fb.1.' . (int) floor(microtime(true) * 1000) . '.' . $tracking['fbclid'] : '';
    }
    $metaOk = cvx_meta_lead($config, [
        'name' => $name, 'email' => $email, 'phone' => $phoneDigits, 'event_id' => $eventId,
        'page_url' => $pageUrl !== '' ? $pageUrl : CVX_PAGE_PREFIX . 'pest-control-answering-service/',
        'ip' => cvx_client_ip(), 'ua' => cvx_line($_SERVER['HTTP_USER_AGENT'] ?? '', 500), 'fbp' => $fbp, 'fbc' => $fbc,
    ]);
    if ($metaOk !== true) {
        error_log('cvx-lead: meta_capi_failed');
    }
}
exit;
