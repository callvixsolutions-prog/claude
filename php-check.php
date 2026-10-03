<?php
header('Content-Type: text/plain');
echo "php=" . PHP_VERSION . "\n";
echo "mail=" . (function_exists('mail') ? 'yes' : 'no') . "\n";
echo "curl=" . (function_exists('curl_init') ? 'yes' : 'no') . "\n";
echo "openssl=" . (extension_loaded('openssl') ? 'yes' : 'no') . "\n";
