<?php
/*
 * Lead endpoint for the main site's contact form (/contact). Replaces Formspree (owner decision, 27 Oct 2026).
 *
 * Adapted from /pest-control-answering-service/send.php (the landing page's endpoint on this same server, whose
 * delivery is confirmed). The form posts here; this script checks the request and emails the enquiry to Chris
 * from this website's own server with PHP mail(). No third-party form service, nothing stored on the server, no
 * personal data written to any log, and no passwords or keys in this file.
 *
 * Two ways in, same rules:
 *   - js/main.js sends the form with fetch() and "Accept: application/json", and gets JSON back. Errors use the
 *     shape main.js already understands: {"ok": false, "errors": [{"field": "email", "message": "..."}]}.
 *     On {"ok": true} main.js marks the session and sends the visitor to /thank-you, where generate_lead fires.
 *   - without JavaScript the plain HTML form posts here: success is a 303 redirect to /thank-you, an error is a
 *     short page with a link back to the form.
 *
 * Spam protection: allowed origin only, the form's hidden _gotcha honeypot, a minimum time on the form (when the
 * page reports elapsed_ms), server-side validation of every field, and at most CVX_MAX_PER_HOUR requests per
 * visitor address per hour.
 */
declare(strict_types=1);

const CVX_ALLOWED_ORIGINS = ['https://callvixsolutions.com'];
const CVX_FROM_NAME = 'Callvix Solutions Website';
const CVX_FROM_ADDRESS = 'noreply@callvixsolutions.com';
const CVX_SUBJECT_PREFIX = 'New website enquiry: ';
const CVX_MAX_PER_HOUR = 5;
const CVX_MIN_MS_ON_FORM = 3000;
const CVX_MAX_BODY_BYTES = 20000;
const CVX_SUCCESS_PATH = '/thank-you';
const CVX_FORM_PATH = '/contact';
const CVX_FALLBACK = 'Could not send. Please call (551) 373-6777 or email contact@callvixsolutions.com.';

// Cloudflare's published ranges (copied from the landing-page endpoint). Only used if the site is ever put
// behind Cloudflare's proxy; otherwise REMOTE_ADDR is the visitor.
const CVX_CLOUDFLARE_RANGES = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];

// The recipient lives here only, never in the page. Owner decision 27 Oct 2026: same inbox as the landing page.
function cvx_recipient(): string
{
    return 'chris' . '@' . 'callvixsupport.com';
}

function cvx_wants_json(): bool
{
    return stripos((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') !== false
        || stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === 0;
}

// $errors: [['field' => 'email', 'message' => '...'], ...]; a field-less entry is a general message.
function cvx_fail(int $status, array $errors): void
{
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow, noarchive, noimageindex');
    if (cvx_wants_json()) {
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'errors' => $errors]);
        exit;
    }
    header('Content-Type: text/html; charset=UTF-8');
    $items = '';
    foreach ($errors as $error) {
        $items .= '<li>' . htmlspecialchars((string) ($error['message'] ?? '')) . '</li>';
    }
    echo '<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>Sorry, that didn’t go through | Callvix Solutions</title>'
        . '<style>body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c2033;background:#fbf9f6}'
        . 'main{max-width:560px;margin:12vh auto;padding:32px 24px;background:#fff;border-radius:16px}h1{font-size:26px;line-height:1.25;margin:0 0 12px;color:#101c4c}'
        . 'a{color:#016d79;font-weight:600}</style></head><body><main><h1>Sorry, that didn’t go through.</h1><ul>' . $items . '</ul>'
        . '<p><a href="' . CVX_FORM_PATH . '">Back to the form</a></p></main></body></html>';
    exit;
}

function cvx_succeed(): void
{
    http_response_code(cvx_wants_json() ? 200 : 303);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow, noarchive, noimageindex');
    if (cvx_wants_json()) {
        header('Content-Type: application/json');
        echo json_encode(['ok' => true]);
        exit;
    }
    header('Location: ' . CVX_SUCCESS_PATH);
    exit;
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

// Multi-line text for the message box: line breaks kept (it only ever goes in the email body), other control
// characters removed, at most two blank lines in a row, capped.
function cvx_text($value, int $max): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = str_replace(["\r\n", "\r"], "\n", (string) $value);
    $text = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/u', ' ', $text) ?? '';
    $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? '';
    $text = trim($text);
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

// At most CVX_MAX_PER_HOUR requests per address per hour, counted separately from the landing-page form. The
// counter is a small file in the system temp folder (never the public folder), named by a hash of the address
// and holding timestamps only. If the temp folder can't be used, the limit is skipped rather than blocking
// real visitors.
function cvx_rate_limited(string $ip): bool
{
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/cvx_rl_' . hash('sha256', 'cvx-contact|' . $ip) . '.json';
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

// The single place that sends email (same call as the landing-page endpoint on this server).
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
    return @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
}

/* ---------- request checks ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    cvx_fail(405, [['message' => 'This address only accepts the contact form.']]);
}

// Origin (sent by every current browser on a POST). Older browsers: fall back to the Referer.
$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim((string) $_SERVER['HTTP_ORIGIN'], '/') : '';
if ($origin === '') {
    $parts = parse_url((string) ($_SERVER['HTTP_REFERER'] ?? ''));
    if (is_array($parts) && isset($parts['scheme'], $parts['host'])) {
        $origin = $parts['scheme'] . '://' . $parts['host'];
    }
}
if (!in_array($origin, CVX_ALLOWED_ORIGINS, true)) {
    cvx_fail(403, [['message' => CVX_FALLBACK]]);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > CVX_MAX_BODY_BYTES) {
    cvx_fail(400, [['message' => CVX_FALLBACK]]);
}
$data = $_POST;

if (cvx_rate_limited(cvx_client_ip())) {
    header('Retry-After: 3600');
    cvx_fail(429, [['message' => 'Too many messages from this connection. Please call (551) 373-6777 or email contact@callvixsolutions.com.']]);
}

// Spam: a filled honeypot, or (when the page reports it) a form sent faster than a person can fill it in.
$honeypot = isset($data['_gotcha']) && is_scalar($data['_gotcha']) ? trim((string) $data['_gotcha']) : '';
$elapsed = isset($data['elapsed_ms']) && is_numeric($data['elapsed_ms']) ? (int) $data['elapsed_ms'] : null;
if ($honeypot !== '' || ($elapsed !== null && $elapsed < CVX_MIN_MS_ON_FORM)) {
    cvx_fail(400, [['message' => CVX_FALLBACK]]);
}

/* ---------- validation ---------- */

$name = cvx_line($data['name'] ?? '', 200);
$company = cvx_line($data['company'] ?? '', 200);
$email = cvx_line($data['email'] ?? '', 200);
$phoneRaw = cvx_line($data['phone'] ?? '', 40);
$state = cvx_line($data['state'] ?? '', 200);
$message = cvx_text($data['message'] ?? '', 3000);

$errors = [];
if (cvx_length($name) < 2 || cvx_length($name) > 80) {
    $errors[] = ['field' => 'name', 'message' => 'Please enter your full name.'];
}
if (cvx_length($company) < 2 || cvx_length($company) > 120) {
    $errors[] = ['field' => 'company', 'message' => 'Please enter your company name.'];
}
if (strlen($email) > 120 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $errors[] = ['field' => 'email', 'message' => 'Please enter a valid email address.'];
}
// Phone is optional; if given it must be a U.S. number (10 digits; area code and exchange can't start with 0 or 1).
$phoneDigits = preg_replace('/\D+/', '', $phoneRaw) ?? '';
if (strlen($phoneDigits) === 11 && $phoneDigits[0] === '1') {
    $phoneDigits = substr($phoneDigits, 1);
}
if ($phoneRaw !== '' && preg_match('/^[2-9]\d{2}[2-9]\d{6}$/', $phoneDigits) !== 1) {
    $errors[] = ['field' => 'phone', 'message' => 'Please enter a 10-digit U.S. phone number, or leave it blank.'];
}
if (cvx_length($state) > 120) {
    $errors[] = ['field' => 'state', 'message' => 'Please shorten the state or service area.'];
}
if (cvx_length($message) > 2000) {
    $errors[] = ['field' => 'message', 'message' => 'Please keep the message under 2,000 characters.'];
}
if ($errors !== []) {
    cvx_fail(400, $errors);
}

/* ---------- the email ---------- */

$phoneDisplay = $phoneRaw === ''
    ? '(not given)'
    : '(' . substr($phoneDigits, 0, 3) . ') ' . substr($phoneDigits, 3, 3) . '-' . substr($phoneDigits, 6) . '  (+1' . $phoneDigits . ')';
$when = (new DateTimeImmutable('now', new DateTimeZone('America/New_York')))->format('D, M j, Y g:i A T');
$lines = [
    'Name: ' . $name,
    'Company: ' . $company,
    'Email: ' . $email,
    'Phone: ' . $phoneDisplay,
    'State / service area: ' . ($state !== '' ? $state : '(not given)'),
    'Submitted: ' . $when,
    'Form: https://callvixsolutions.com/contact',
    '',
    'Current call flow:',
    $message !== '' ? $message : '(no message)',
    '',
    'Reply to this email to write to them directly.',
];

$sent = cvx_send_mail(cvx_recipient(), CVX_SUBJECT_PREFIX . $company, implode("\r\n", str_replace("\n", "\r\n", $lines)) . "\r\n", $email);
if ($sent !== true) {
    error_log('cvx-contact: send_failed');
    cvx_fail(500, [['message' => CVX_FALLBACK]]);
}

cvx_succeed();
