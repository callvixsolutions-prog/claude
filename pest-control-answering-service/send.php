<?php
/*
 * Lead endpoint for the Callvix Solutions landing page (/pest-control-answering-service/).
 *
 * Adapted from the PestMaster landing page's send.php (pmnaperville.com), which runs on the
 * same Hostinger server. The page posts a lead here; this script checks it and emails it to
 * Chris's mailbox from this website's own server with PHP mail(). No third-party form
 * service, no personal data written to any log, and no passwords or keys in this file.
 *
 * Lead record (owner-approved 29 Oct 2026): every lead is also written to a private file on the
 * server, in callvix-leads/ next to public_html (out of the web's reach), one file per month, kept
 * 12 months. It is the backup copy if an email goes missing, and it is how a repeated request for
 * the same submission is recognised: the page sends a submission_id and reuses it on every retry,
 * so a retry after a lost answer gets "accepted" again without a second email or a second
 * conversion. A genuinely new submission has a new id.
 *
 * Two ways in:
 *   - the page's script sends JSON (Content-Type: application/json) and gets JSON back:
 *     {"ok": true, "status": "accepted", "submission_id": "..."} only when the email was handed
 *     to the mail system (now or by an earlier request with the same id); the page counts a lead
 *     only on that answer;
 *   - without JavaScript the plain HTML form posts here and gets a short HTML page back.
 *
 * Spam protection: allowed origin only, a hidden honeypot field, a minimum time on the form
 * (when the page's script reports it), server-side validation of every field, and at most
 * CVX_MAX_PER_HOUR new leads per visitor address per hour (spam rejects, invalid requests and
 * repeats of an accepted submission don't count towards it).
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
const CVX_TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
const CVX_CONFIG_FILE = 'callvix-config.php';               // two folders up: next to public_html, out of the web's reach
const CVX_LEAD_DIR = 'callvix-leads';                       // same place: the private lead record (see the header)
const CVX_LEAD_KEEP_MONTHS = 12;
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
    if (defined('CVX_TEST_MAIL_FILE')) {
        // Local tests only (the constant is defined by the test runner, never by a request): record instead of mailing.
        @file_put_contents((string) constant('CVX_TEST_MAIL_FILE'), $subject . "\n" . $body . "\n---\n", FILE_APPEND);
        return !defined('CVX_TEST_MAIL_FAIL');
    }
    // Same call as the PestMaster endpoint on this server, whose delivery was confirmed.
    return @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
}

/* ---------- lead record ---------- */

// The folder above public_html (where callvix-config.php lives). Local tests point it elsewhere.
function cvx_data_dir(): string
{
    return defined('CVX_TEST_DATA_DIR') ? (string) constant('CVX_TEST_DATA_DIR') : dirname(__DIR__, 2);
}

// The page's id for this submission ("lead.<time>.<random>"), reused on every retry. '' when absent or malformed.
function cvx_submission_id($value): string
{
    $id = is_string($value) ? $value : '';
    return preg_match('/^lead\.[a-z0-9]{6,12}\.[a-z0-9]{4,10}$/', $id) === 1 ? $id : '';
}

// Opens the lead record folder and takes its lock (so two copies of the same request can't both send
// an email). Returns the lock handle, or null when the folder can't be used; the lead still goes out
// by email then, without the backup copy or the repeat check.
function cvx_store_lock()
{
    $dir = cvx_data_dir() . '/' . CVX_LEAD_DIR;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return null;
    }
    $handle = @fopen($dir . '/.lock', 'c');
    if ($handle === false) {
        return null;
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return null;
    }
    return $handle;
}

function cvx_store_unlock($handle): void
{
    if ($handle) {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function cvx_store_file(int $monthsAgo = 0): string
{
    $month = (new DateTimeImmutable('first day of this month', new DateTimeZone('UTC')))->modify('-' . $monthsAgo . ' month');
    return cvx_data_dir() . '/' . CVX_LEAD_DIR . '/leads-' . $month->format('Y-m') . '.jsonl';
}

// True when this submission was already accepted (its email went out), this month or last.
function cvx_already_accepted(string $id): bool
{
    if ($id === '') {
        return false;
    }
    $needle = '{"submission_id":"' . $id . '","mail_sent":true,';
    foreach ([0, 1] as $monthsAgo) {
        $file = cvx_store_file($monthsAgo);
        if (is_file($file)) {
            $text = @file_get_contents($file);
            if (is_string($text) && strpos($text, $needle) !== false) {
                return true;
            }
        }
    }
    return false;
}

// Appends one lead (submission_id and mail_sent first: cvx_already_accepted reads them in that order).
function cvx_store_append(array $record): bool
{
    $file = cvx_store_file();
    $new = !is_file($file);
    $line = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($line) || @file_put_contents($file, $line . "\n", FILE_APPEND) === false) {
        return false;
    }
    if ($new) {
        @chmod($file, 0600);
    }
    return true;
}

// Deletes monthly files older than CVX_LEAD_KEEP_MONTHS.
function cvx_store_prune(): void
{
    $oldest = (new DateTimeImmutable('first day of this month', new DateTimeZone('UTC')))
        ->modify('-' . CVX_LEAD_KEEP_MONTHS . ' month')->format('Y-m');
    foreach (glob(cvx_data_dir() . '/' . CVX_LEAD_DIR . '/leads-*.jsonl') ?: [] as $file) {
        if (preg_match('/leads-(\d{4}-\d{2})\.jsonl$/', $file, $m) === 1 && strcmp($m[1], $oldest) < 0) {
            @unlink($file);
        }
    }
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
// Remembered tracked visits from the page script (first within 90 days, and latest). Same rule: never rejected.
$firstVisit = cvx_line($data['first_visit'] ?? '', 1000);
$latestVisit = cvx_line($data['latest_visit'] ?? '', 1000);
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
    'This visit:',
];
foreach ($tracking as $key => $value) {
    $lines[] = $key . ': ' . ($value !== '' ? $value : '(none)');
}
$lines[] = '';
$lines[] = 'First tracked visit (last 90 days): ' . ($firstVisit !== '' ? $firstVisit : '(none)');
$lines[] = 'Latest tracked visit: ' . ($latestVisit !== '' ? $latestVisit : '(none)');
$lines[] = '';
$lines[] = 'Reply to this email to write to the lead directly.';

/* ---------- accept once ---------- */

// The page's id for this submission (the same id is the conversion's event_id for Google, Meta and the
// Conversions API). A plain form post without JavaScript has none, so it gets a fresh one here.
$submissionId = cvx_submission_id($data['event_id'] ?? '');
$fromPage = $submissionId !== '';
if (!$fromPage) {
    $submissionId = 'lead.srv' . substr(bin2hex(random_bytes(4)), 0, 6) . '.' . bin2hex(random_bytes(3));
}
$lines[] = 'Lead ID: ' . $submissionId;

$lock = cvx_store_lock();
if ($lock === null) {
    error_log('cvx-lead: store_unavailable');
}
if ($lock !== null && $fromPage && cvx_already_accepted($submissionId)) {
    // A repeat of a submission that already went out (the visitor's answer was lost, or a retry crossed it).
    cvx_store_unlock($lock);
    cvx_respond(200, ['ok' => true, 'status' => 'accepted', 'submission_id' => $submissionId, 'repeat' => true]);
}
if (cvx_rate_limited(cvx_client_ip())) {
    cvx_store_unlock($lock);
    header('Retry-After: 3600');
    cvx_respond(429, ['ok' => false, 'error' => 'rate_limited']);
}

$sent = cvx_send_mail(cvx_recipient(), CVX_SUBJECT_PREFIX . $business, implode("\r\n", $lines) . "\r\n", $email);
if ($lock !== null) {
    $stored = cvx_store_append([
        'submission_id' => $submissionId,
        'mail_sent' => $sent === true,
        'received_at' => gmdate('c'),
        'name' => $name, 'business' => $business, 'phone' => $phoneDigits, 'email' => $email,
        'page_url' => $pageUrl, 'tracking' => $tracking, 'first_visit' => $firstVisit, 'latest_visit' => $latestVisit,
    ]);
    if (!$stored) {
        error_log('cvx-lead: store_failed');
    }
    cvx_store_prune();
    cvx_store_unlock($lock);
}
if ($sent !== true) {
    // Not accepted: the page keeps the details and tries again with the same id (the record above keeps
    // a copy meanwhile, marked mail_sent false, so the lead is never only in the visitor's browser).
    error_log('cvx-lead: send_failed');
    cvx_respond(500, ['ok' => false, 'error' => 'send_failed']);
}

// The visitor gets the answer now; Meta is told afterwards, so a slow Meta never delays the page.
cvx_output(200, ['ok' => true, 'status' => 'accepted', 'submission_id' => $submissionId]);
if (function_exists('litespeed_finish_request')) {
    litespeed_finish_request();
} elseif (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

$config = cvx_config();
// Our own test leads (utm_campaign=test-lead-ignore, see README §9) still email and are recorded, but never reach Meta.
if ($config !== [] && $tracking['utm_campaign'] !== 'test-lead-ignore') {
    $eventId = $submissionId;                   // the same id the page gave the browser pixel, so Meta counts it once
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
