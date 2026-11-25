<?php
// (선택) 서버 크론: 미체결 지정가 주문을 주기적으로 체결 검사 — 예) */2 * * * * php /경로/server/cron.php
// 크론이 없어도 회원이 접속해 API 를 호출할 때마다 30초 간격으로 자동 검사됩니다.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/lib.php';
date_default_timezone_set('Asia/Seoul');
$n = is_live() ? match_pending(true) : 0;
// 일별 자산 스냅샷은 클라이언트가 기록 (평가 로직 단일화)
echo date('c') . " matched $n\n";
