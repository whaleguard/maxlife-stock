<?php
// 최초 1회 실행: 테이블 생성 + 관리자 계정 + 기본 설정. 실행 후 installed.lock 이 생기며 재실행되지 않습니다.
declare(strict_types=1);
require __DIR__ . '/lib.php';
date_default_timezone_set('Asia/Seoul');
header('Content-Type: text/plain; charset=utf-8');
$lock = __DIR__ . '/installed.lock';
if (is_file($lock)) { echo "이미 설치되었습니다. 다시 설치하려면 installed.lock 을 삭제하세요.\n"; exit; }
$sql = (string)file_get_contents(__DIR__ . '/schema.sql');
foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) if (stripos($stmt, 'CREATE') !== false || stripos($stmt, 'SET') === 0) db()->exec($stmt);
echo "테이블 생성 완료\n";
$a = cfg('admin');
if (!row('SELECT id FROM mls_users WHERE username=?', [$a['username']])) {
  q("INSERT INTO mls_users (id,username,pw,name,role,status,cash,initial,watch,created_at) VALUES (?,?,?,?,'admin','active',0,0,'[]',NOW())", [uid('u'), $a['username'], password_hash($a['password'], PASSWORD_DEFAULT), $a['name']]);
  echo "관리자 계정 생성: {$a['username']}\n";
}
if (!row("SELECT k FROM mls_kv WHERE k='settings'")) { save_settings([]); echo "기본 설정 저장\n"; }
q("INSERT IGNORE INTO mls_notices (id,title,body,pinned,at) VALUES (?,?,?,1,NOW())", [uid('n'), 'MAX라이프 주식 모의투자 오픈 안내', '가입 시 가상 예수금이 지급됩니다. 실제 시세 기준으로 체결되며 실제 돈은 오가지 않습니다.']);
@mkdir(cfg('cache_dir'), 0775, true);
file_put_contents($lock, date('c'));
echo "설치 완료. 보안을 위해 config.php 의 admin.password 를 지우고, 관리자 페이지에서 비밀번호를 변경하세요.\n";
echo is_live() ? "실시세: 연결됨\n" : "실시세: 미연결 (GitHub Secrets 에 KIS 키 등록 후 Actions 실행 필요 — 그 전까지 주문 불가)\n";
