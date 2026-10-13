<?php
/*
 * Quote-form endpoint for the PestMaster of Naperville/Wheaton landing page.
 *
 * The page posts a request here as JSON; this script checks it and emails it to the
 * business from this website's own server. Nothing is stored on the server and no
 * personal data is written to any log. No passwords or keys belong in this file.
 *
 * It answers {"ok": true, "lead_id": "..."} only when the email was handed to the
 * mail system. Everything else is an error in JSON, which the page treats as
 * "not confirmed".
 */
declare(strict_types=1);

// Sites that may post here. Add the launch domain when the page moves.
const PM_ALLOWED_ORIGINS = ['https://callvixsolutions.com'];
const PM_FROM_NAME = 'PestMaster Landing Page';
const PM_FROM_ADDRESS = 'forms@callvixsolutions.com';
const PM_SUBJECT = 'New quote request: PestMaster landing page';
const PM_MAX_PER_HOUR = 5;
const PM_MIN_MS_ON_FORM = 3000;
const PM_MAX_BODY_BYTES = 20000;

// Allowlists. They must match the page (tests/send.test.mjs compares them).
const PM_FORM_SERVICES = ['general', 'rodent', 'bedbug', 'termite-wdi', 'wildlife', 'dead-animal', 'commercial', 'vehicle', 'not-sure'];
const PM_CAMPAIGN_SERVICES = ['', 'general', 'ant', 'cockroach', 'spider', 'rodent', 'bedbug', 'flea-tick', 'stinging', 'termite-inspection', 'wdi-inspection', 'wildlife', 'dead-animal', 'commercial', 'vehicle'];
const PM_PESTS = ['', 'ants', 'cockroaches', 'spiders', 'mice-rats', 'bed-bugs', 'wasps-hornets', 'fleas-ticks', 'crickets-silverfish', 'termite-wdi', 'wildlife', 'dead-animal', 'commercial', 'vehicle'];

function pm_recipient(): string
{
    return 'callvixsolutions' . '@' . 'gmail.com';
}

function pm_respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow, noarchive, noimageindex');
    echo json_encode($body);
    exit;
}

// One line of plain text: no control characters (so no line breaks), trimmed, capped.
function pm_line($value, int $max): string
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

function pm_length(string $text): int
{
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

// At most PM_MAX_PER_HOUR requests per address per hour. The counter is a small file
// in the system temp folder (never in the public folder), named by a hash of the
// address and holding timestamps only. If the temp folder cannot be used, the limit
// is skipped rather than blocking real visitors.
function pm_rate_limited(string $ip): bool
{
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/pm_rl_' . hash('sha256', 'pm-quote|' . $ip) . '.json';
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
        if (count($recent) >= PM_MAX_PER_HOUR) {
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

// The single place that sends email. To move to SMTP later (for example PHPMailer with
// a mailbox on this domain), replace the body of this function only; its password
// must be placed on the server by the site owner, never in this repository.
function pm_send_mail(string $to, string $subject, string $body, string $replyTo): bool
{
    $headers = [
        'From: "' . PM_FROM_NAME . '" <' . PM_FROM_ADDRESS . '>',
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
    pm_respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim((string) $_SERVER['HTTP_ORIGIN'], '/') : '';
if (!in_array($origin, PM_ALLOWED_ORIGINS, true)) {
    pm_respond(403, ['ok' => false, 'error' => 'forbidden_origin']);
}

if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    header('Allow: POST');
    pm_respond(405, ['ok' => false, 'error' => 'json_only']);
}

$raw = file_get_contents('php://input', false, null, 0, PM_MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > PM_MAX_BODY_BYTES) {
    pm_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => ['body']]);
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    pm_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => ['body']]);
}

if (pm_rate_limited((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'))) {
    header('Retry-After: 3600');
    pm_respond(429, ['ok' => false, 'error' => 'rate_limited']);
}

// Spam: a filled honeypot, or a form sent faster than a person can fill it in.
$honeypot = isset($data['honeypot']) && is_scalar($data['honeypot']) ? trim((string) $data['honeypot']) : '';
$elapsed = isset($data['elapsed_ms']) && is_numeric($data['elapsed_ms']) ? (int) $data['elapsed_ms'] : 0;
if ($honeypot !== '' || $elapsed < PM_MIN_MS_ON_FORM) {
    pm_respond(400, ['ok' => false, 'error' => 'rejected']);
}

/* ---------- validation ---------- */

$name = pm_line($data['name'] ?? '', 200);
$phoneDigits = preg_replace('/\D+/', '', (string) (is_scalar($data['phone_e164'] ?? null) ? $data['phone_e164'] : '')) ?? '';
if ($phoneDigits === '') {
    $phoneDigits = preg_replace('/\D+/', '', (string) (is_scalar($data['phone_display'] ?? null) ? $data['phone_display'] : '')) ?? '';
}
if (strlen($phoneDigits) === 11 && $phoneDigits[0] === '1') {
    $phoneDigits = substr($phoneDigits, 1);
}
$zip = pm_line($data['zip'] ?? '', 20);
$email = pm_line($data['email'] ?? '', 200);
$noteRaw = is_scalar($data['note'] ?? '') ? (string) ($data['note'] ?? '') : '';
$service = pm_line($data['service_selected'] ?? ($data['service'] ?? ''), 40);
$campaign = pm_line($data['campaign_svc'] ?? '', 40);
$pest = pm_line($data['pest_clicked'] ?? '', 40);
$leadId = pm_line($data['lead_id'] ?? '', 40);

$invalid = [];
if (pm_length($name) < 1 || pm_length($name) > 80) {
    $invalid[] = 'name';
}
if (strlen($phoneDigits) !== 10) {
    $invalid[] = 'phone';
}
if (preg_match('/^\d{5}$/', $zip) !== 1) {
    $invalid[] = 'zip';
}
if ($email !== '' && (strlen($email) > 120 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
    $invalid[] = 'email';
}
if (pm_length($noteRaw) > 1000) {
    $invalid[] = 'note';
}
if (!in_array($service, PM_FORM_SERVICES, true)) {
    $invalid[] = 'service';
}
if (!in_array($campaign, PM_CAMPAIGN_SERVICES, true)) {
    $invalid[] = 'campaign_svc';
}
if (!in_array($pest, PM_PESTS, true)) {
    $invalid[] = 'pest_clicked';
}
if (preg_match('/^PM-\d{8}-[2-9A-HJKMNP-Z]{6}$/', $leadId) !== 1) {
    $invalid[] = 'lead_id';
}
if ($invalid !== []) {
    pm_respond(400, ['ok' => false, 'error' => 'invalid', 'fields' => $invalid]);
}

/* ---------- the email ---------- */

$phoneDisplay = '(' . substr($phoneDigits, 0, 3) . ') ' . substr($phoneDigits, 3, 3) . '-' . substr($phoneDigits, 6);
$note = pm_line(str_replace(["\r\n", "\r", "\n"], ' / ', $noteRaw), 1200);
$lines = [
    'Reference: ' . $leadId,
    '',
    'Name: ' . $name,
    'Phone: ' . $phoneDisplay,
    'Phone (E.164): +1' . $phoneDigits,
    'ZIP: ' . $zip,
    'ZIP on the listed service area: ' . (($data['zip_in_listed_area'] ?? '') === 'yes' ? 'yes' : 'no'),
    'Email: ' . ($email !== '' ? $email : '(not given)'),
    'Note: ' . ($note !== '' ? $note : '(none)'),
    '',
    'Service selected: ' . $service,
    'Campaign service: ' . ($campaign !== '' ? $campaign : '(none)'),
    'Pest clicked: ' . ($pest !== '' ? $pest : '(none)'),
    'Text-message consent: ' . (($data['sms_consent'] ?? '') === 'yes' ? 'yes' : 'no'),
    '',
    'Page service: ' . pm_line($data['svc'] ?? '', 80),
    'Page location: ' . pm_line($data['s'] ?? '', 80),
    'Page variant: ' . pm_line($data['variant'] ?? '', 60),
    'Landing page: ' . pm_line($data['landing_url'] ?? '', 300),
    'Submitted: ' . pm_line($data['submitted_at'] ?? '', 40),
    'Time on form (ms): ' . $elapsed,
    '',
];
foreach (['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $key) {
    $lines[] = $key . ': ' . pm_line($data[$key] ?? '', 200);
}

$subject = PM_SUBJECT . ' · ' . $leadId;
$sent = pm_send_mail(pm_recipient(), $subject, implode("\r\n", $lines) . "\r\n", $email);
if ($sent !== true) {
    error_log('pm-quote: send_failed');
    pm_respond(500, ['ok' => false, 'error' => 'send_failed']);
}
pm_respond(200, ['ok' => true, 'lead_id' => $leadId]);
