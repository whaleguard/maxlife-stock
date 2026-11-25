<?php
// MAX라이프 주식 — 운영 모드 REST API (POST api.php?action=...)
declare(strict_types=1);
require __DIR__ . '/lib.php';
date_default_timezone_set('Asia/Seoul');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = cfg('allow_origins') ?: [];
if ($origin && in_array($origin, $allowed, true)) {
  header("Access-Control-Allow-Origin: $origin");
  header('Vary: Origin');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('POST only', 405);

$in = json_decode((string)file_get_contents('php://input'), true) ?: [];
$action = (string)($_GET['action'] ?? '');

// 인증 토큰: Authorization 헤더 → 본문 _t (Cafe24 등 헤더가 제거되는 호스팅 대응)
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
$token = preg_match('/Bearer\s+([a-f0-9]{64})/i', $auth, $m) ? $m[1] : (preg_match('/^[a-f0-9]{64}$/', (string)($in['_t'] ?? '')) ? $in['_t'] : '');
$ME = null;
if ($token) {
  $s = row('SELECT u.* FROM mls_sessions s JOIN mls_users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>NOW()', [$token]);
  if ($s && $s['status'] === 'active') $ME = $s;
}
function need_user(): array { global $ME; if (!$ME) fail('로그인이 필요합니다.', 401); return $ME; }
function need_admin(): array { $u = need_user(); if ($u['role'] !== 'admin') fail('관리자 권한이 필요합니다.', 403); return $u; }
function need_staff(): array { $u = need_user(); if (!in_array($u['role'], ['admin', 'instructor'], true)) fail('강사/관리자 권한이 필요합니다.', 403); return $u; }
function str($v, int $max = 200): string { return mb_substr(trim((string)$v), 0, $max); }
function new_session(string $uid): string {
  $t = bin2hex(random_bytes(32));
  q('INSERT INTO mls_sessions (token,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 30 DAY))', [$t, $uid]);
  q('UPDATE mls_users SET last_login=NOW() WHERE id=?', [$uid]);
  q('INSERT INTO mls_logins (user_id,at) VALUES (?,NOW())', [$uid]);
  if (random_int(1, 50) === 1) q('DELETE FROM mls_sessions WHERE expires_at<NOW()');
  return $t;
}
function posts_out(): array {
  $ps = rows('SELECT * FROM mls_posts ORDER BY at DESC LIMIT 200');
  $ids = array_column($ps, 'id'); $cm = []; $lk = [];
  if ($ids) {
    $in = implode(',', array_fill(0, count($ids), '?'));
    foreach (rows("SELECT * FROM mls_comments WHERE post_id IN ($in) ORDER BY at", $ids) as $c) $cm[$c['post_id']][] = ['id' => $c['id'], 'userId' => $c['user_id'], 'name' => $c['name'], 'text' => $c['text'], 'at' => iso($c['at'])];
    foreach (rows("SELECT * FROM mls_likes WHERE post_id IN ($in)", $ids) as $l) $lk[$l['post_id']][] = $l['user_id'];
  }
  return array_map(fn($p) => ['id' => $p['id'], 'authorId' => $p['author_id'], 'authorName' => $p['author_name'], 'kind' => $p['kind'], 'title' => $p['title'], 'body' => $p['body'], 'code' => $p['code'], 'side' => $p['side'], 'entry' => (float)$p['entry'], 'target' => (float)$p['target'], 'stop' => (float)$p['stop'], 'result' => $p['result'], 'resultPct' => (float)$p['result_pct'], 'video' => $p['video'], 'image' => $p['image'], 'at' => iso($p['at']), 'updatedAt' => iso($p['updated_at']), 'comments' => $cm[$p['id']] ?? [], 'likes' => $lk[$p['id']] ?? []], $ps);
}

try {
  if (is_live()) match_pending();

  switch ($action) {
    // ── 인증 ──
    case 'current': done($ME ? user_pub($ME) : null);
    case 'login':
      $u = row('SELECT * FROM mls_users WHERE username=?', [str($in['username'] ?? '', 40)]);
      if (!$u || !password_verify((string)($in['pw'] ?? ''), $u['pw'])) { usleep(400000); fail('아이디 또는 비밀번호가 올바르지 않습니다.'); }
      if ($u['status'] === 'suspended') fail('정지된 계정입니다. 관리자에게 문의하세요.');
      done(['token' => new_session($u['id']), 'user' => user_pub($u)]);
    case 'signup':
      $st = settings(); if (!$st['allowSignup']) fail('현재 신규 가입이 중단되었습니다.');
      $un = str($in['username'] ?? '', 40); $pw = (string)($in['pw'] ?? ''); $nm = str($in['name'] ?? '', 20);
      if (!preg_match('/^[a-zA-Z0-9_]{4,20}$/', $un)) fail('아이디는 영문/숫자 4~20자입니다.');
      if (strlen($pw) < 6) fail('비밀번호는 6자 이상입니다.');
      if ($nm === '') fail('이름을 입력해 주세요.');
      if (row('SELECT id FROM mls_users WHERE username=?', [$un])) fail('이미 사용 중인 아이디입니다.');
      $id = uid('u');
      q('INSERT INTO mls_users (id,username,pw,name,role,status,phone,cash,initial,watch,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())',
        [$id, $un, password_hash($pw, PASSWORD_DEFAULT), $nm, 'user', 'active', str($in['phone'] ?? '', 40), $st['initialCash'], $st['initialCash'], json_encode(['005930', '000660', 'NVDA', 'AAPL'])]);
      done(['token' => new_session($id), 'user' => user_pub(row('SELECT * FROM mls_users WHERE id=?', [$id]))]);
    case 'logout': if ($token) q('DELETE FROM mls_sessions WHERE token=?', [$token]); done(true);

    // ── 내 계좌 ──
    case 'me': $u = need_user(); done(bundle($u['id']));
    case 'settings': done(settings()); // 비로그인 화면(가입 안내)에서도 사용
    case 'placeOrder':
      $u = need_user();
      $o = ['code' => str($in['code'] ?? '', 16), 'side' => (string)($in['side'] ?? ''), 'type' => (string)($in['type'] ?? ''), 'price' => (float)($in['price'] ?? 0), 'qty' => (int)($in['qty'] ?? 0)];
      if ($err = validate_order($u, $o)) fail($err);
      $qt = quote($o['code']); $id = uid('o');
      q("INSERT INTO mls_orders (id,user_id,code,name,side,type,price,qty,filled,status,currency,created_at) VALUES (?,?,?,?,?,?,?,?,0,'pending',?,NOW())",
        [$id, $u['id'], $o['code'], $qt['name'], $o['side'], $o['type'], $o['type'] === 'market' ? 0 : $o['price'], $o['qty'], $qt['currency']]);
      $ord = row('SELECT * FROM mls_orders WHERE id=?', [$id]);
      $fill = try_fill($ord);
      if ($o['type'] === 'market' && !$fill) { q("UPDATE mls_orders SET status='rejected', reason='체결 불가', updated_at=NOW() WHERE id=?", [$id]); fail('시장가 주문이 체결되지 않았습니다.'); }
      done(['order' => map_order(row('SELECT * FROM mls_orders WHERE id=?', [$id])), 'fill' => $fill]);
    case 'cancelOrder':
      $u = need_user(); $o = row("SELECT * FROM mls_orders WHERE id=? AND user_id=?", [str($in['id'] ?? '', 24), $u['id']]);
      if (!$o || $o['status'] !== 'pending') fail('취소할 수 없는 주문입니다.');
      q("UPDATE mls_orders SET status='cancelled', updated_at=NOW() WHERE id=? AND status='pending'", [$o['id']]); done(true);
    case 'amendOrder':
      $u = need_user(); $o = row("SELECT * FROM mls_orders WHERE id=? AND user_id=?", [str($in['id'] ?? '', 24), $u['id']]);
      if (!$o || $o['status'] !== 'pending') fail('정정할 수 없는 주문입니다.');
      $n = ['code' => $o['code'], 'side' => $o['side'], 'type' => 'limit', 'price' => (float)($in['price'] ?? 0), 'qty' => (int)($in['qty'] ?? 0)];
      if ($err = validate_order($u, $n, $o['id'])) fail($err);
      q("UPDATE mls_orders SET price=?, qty=?, type='limit', amended=amended+1, updated_at=NOW() WHERE id=? AND status='pending'", [$n['price'], $n['qty'], $o['id']]);
      $fill = try_fill(row('SELECT * FROM mls_orders WHERE id=?', [$o['id']]));
      done(['order' => map_order(row('SELECT * FROM mls_orders WHERE id=?', [$o['id']])), 'fill' => $fill]);
    case 'requestCash':
      $u = need_user(); $st = settings(); $type = ($in['type'] ?? '') === 'withdraw' ? 'withdraw' : 'deposit'; $amt = floor((float)($in['amount'] ?? 0));
      if ($amt < 10000) fail('최소 10,000원 이상 신청 가능합니다.');
      if ($type === 'deposit' && $amt > $st['maxDeposit']) fail('1회 최대 ' . number_format((float)$st['maxDeposit']) . '원까지 신청 가능합니다.');
      if ($type === 'withdraw' && $amt > orderable($u['id'])) fail('출금가능금액을 초과했습니다.');
      if ((int)row("SELECT COUNT(*) n FROM mls_cashflows WHERE user_id=? AND status='pending'", [$u['id']])['n'] >= 3) fail('처리 대기 중인 신청이 3건 이상입니다.');
      $id = uid('c');
      q("INSERT INTO mls_cashflows (id,user_id,type,amount,memo,status,at) VALUES (?,?,?,?,?,'pending',NOW())", [$id, $u['id'], $type, $amt, str($in['memo'] ?? '', 60)]);
      if ($st['autoApprove']) apply_cash(['id' => $id], true, 'auto');
      done(map_cash(row('SELECT * FROM mls_cashflows WHERE id=?', [$id])));
    case 'cancelCash':
      $u = need_user(); $n = q("UPDATE mls_cashflows SET status='cancelled', processed_at=NOW() WHERE id=? AND user_id=? AND status='pending'", [str($in['id'] ?? '', 24), $u['id']])->rowCount();
      if (!$n) fail('취소할 수 없습니다.'); done(true);
    case 'toggleWatch':
      $u = need_user(); $w = json_decode($u['watch'] ?: '[]', true) ?: []; $c = str($in['code'] ?? '', 16);
      $w = in_array($c, $w, true) ? array_values(array_diff($w, [$c])) : array_merge($w, [$c]);
      q('UPDATE mls_users SET watch=? WHERE id=?', [json_encode(array_slice($w, 0, 100)), $u['id']]); done($w);
    case 'updateProfile':
      $u = need_user(); q('UPDATE mls_users SET name=?, phone=?, email=? WHERE id=?', [str($in['name'] ?? $u['name'], 20) ?: $u['name'], str($in['phone'] ?? '', 40), str($in['email'] ?? '', 120), $u['id']]);
      done(user_pub(row('SELECT * FROM mls_users WHERE id=?', [$u['id']])));
    case 'changePassword':
      $u = need_user(); if (!password_verify((string)($in['oldPw'] ?? ''), $u['pw'])) fail('현재 비밀번호가 올바르지 않습니다.');
      if (strlen((string)($in['newPw'] ?? '')) < 6) fail('새 비밀번호는 6자 이상입니다.');
      q('UPDATE mls_users SET pw=? WHERE id=?', [password_hash((string)$in['newPw'], PASSWORD_DEFAULT), $u['id']]);
      q('DELETE FROM mls_sessions WHERE user_id=? AND token<>?', [$u['id'], $token]); done(true);
    case 'resetAccount':
      $u = need_user(); $st = settings();
      foreach (['mls_orders', 'mls_fills', 'mls_cashflows', 'mls_positions', 'mls_snapshots'] as $t) q("DELETE FROM $t WHERE user_id=?", [$u['id']]);
      q('UPDATE mls_users SET cash=?, initial=? WHERE id=?', [$st['initialCash'], $st['initialCash'], $u['id']]); done(true);
    case 'recordSnapshot':
      $u = need_user(); q('REPLACE INTO mls_snapshots (user_id,d,total) VALUES (?,CURDATE(),?)', [$u['id'], round((float)($in['total'] ?? 0))]); done(true);

    // ── 리딩 · 공지 ──
    case 'posts': need_user(); done(posts_out());
    case 'savePost':
      $u = need_staff(); $t = str($in['title'] ?? '', 200); if ($t === '') fail('제목을 입력해 주세요.');
      $f = [($in['kind'] ?? '') === 'lesson' ? 'lesson' : 'trade', $t, str($in['body'] ?? '', 20000), str($in['code'] ?? '', 16), str($in['side'] ?? '', 8), (float)($in['entry'] ?? 0), (float)($in['target'] ?? 0), (float)($in['stop'] ?? 0), str($in['result'] ?? '', 12), (float)($in['resultPct'] ?? 0), str($in['video'] ?? '', 300), str($in['image'] ?? '', 300)];
      if (!empty($in['id'])) q('UPDATE mls_posts SET kind=?,title=?,body=?,code=?,side=?,entry=?,target=?,stop=?,result=?,result_pct=?,video=?,image=?,updated_at=NOW() WHERE id=?', array_merge($f, [str($in['id'], 24)]));
      else q('INSERT INTO mls_posts (kind,title,body,code,side,entry,target,stop,result,result_pct,video,image,id,author_id,author_name,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())', array_merge($f, [uid('p'), $u['id'], $u['name']]));
      done(true);
    case 'deletePost': need_staff(); $id = str($in['id'] ?? '', 24); q('DELETE FROM mls_posts WHERE id=?', [$id]); q('DELETE FROM mls_comments WHERE post_id=?', [$id]); q('DELETE FROM mls_likes WHERE post_id=?', [$id]); done(true);
    case 'comment':
      $u = need_user(); $t = str($in['text'] ?? '', 500); if ($t === '') fail('내용을 입력해 주세요.');
      if (!row('SELECT id FROM mls_posts WHERE id=?', [str($in['postId'] ?? '', 24)])) fail('게시물이 없습니다.');
      q('INSERT INTO mls_comments (id,post_id,user_id,name,text,at) VALUES (?,?,?,?,?,NOW())', [uid('m'), str($in['postId'], 24), $u['id'], $u['name'], $t]); done(true);
    case 'deleteComment':
      $u = need_user(); $c = row('SELECT * FROM mls_comments WHERE id=?', [str($in['cid'] ?? '', 24)]);
      if (!$c) done(true); if ($c['user_id'] !== $u['id'] && $u['role'] === 'user') fail('권한이 없습니다.');
      q('DELETE FROM mls_comments WHERE id=?', [$c['id']]); done(true);
    case 'like':
      $u = need_user(); $pid = str($in['postId'] ?? '', 24);
      if (row('SELECT 1 x FROM mls_likes WHERE post_id=? AND user_id=?', [$pid, $u['id']])) q('DELETE FROM mls_likes WHERE post_id=? AND user_id=?', [$pid, $u['id']]);
      else q('INSERT INTO mls_likes (post_id,user_id) VALUES (?,?)', [$pid, $u['id']]);
      done(true);
    case 'notices': need_user(); done(array_map(fn($n) => ['id' => $n['id'], 'title' => $n['title'], 'body' => $n['body'], 'pinned' => (bool)$n['pinned'], 'at' => iso($n['at'])], rows('SELECT * FROM mls_notices ORDER BY pinned DESC, at DESC LIMIT 100')));
    case 'saveNotice':
      need_staff(); $t = str($in['title'] ?? '', 200); if ($t === '') fail('제목을 입력해 주세요.');
      if (!empty($in['id'])) q('UPDATE mls_notices SET title=?, body=?, pinned=? WHERE id=?', [$t, str($in['body'] ?? '', 5000), !empty($in['pinned']) ? 1 : 0, str($in['id'], 24)]);
      else q('INSERT INTO mls_notices (id,title,body,pinned,at) VALUES (?,?,?,?,NOW())', [uid('n'), $t, str($in['body'] ?? '', 5000), !empty($in['pinned']) ? 1 : 0]);
      done(true);
    case 'deleteNotice': need_staff(); q('DELETE FROM mls_notices WHERE id=?', [str($in['id'] ?? '', 24)]); done(true);
    case 'ranking':
      $me = need_user(); $out = [];
      foreach (rows("SELECT id FROM mls_users WHERE role='user' AND status='active'") as $r) {
        $b = bundle($r['id']); $self = $r['id'] === $me['id'];
        $out[] = ['user' => ['id' => $b['user']['id'], 'name' => $self ? $b['user']['name'] : mask_name($b['user']['name']), 'initial' => $b['user']['initial'], 'cash' => $b['user']['cash'], 'status' => 'active'],
          'positions' => $b['positions'], 'orders' => [], 'fills' => array_map(fn($f) => ['pnl' => $f['pnl']], $b['fills']), 'cashflows' => array_values(array_filter($b['cashflows'], fn($c) => $c['status'] === 'approved'))];
      }
      done($out);

    // ── 관리자 ──
    case 'saveSettings':
      $a = need_admin(); $allow = ['feeKr', 'feeUs', 'taxKr', 'initialCash', 'autoApprove', 'enforceHours', 'allowSignup', 'maxDeposit', 'overrides'];
      $patch = array_intersect_key($in, array_flip($allow)); unset($patch['_t']);
      foreach (['feeKr', 'feeUs', 'taxKr', 'initialCash', 'maxDeposit'] as $k) if (isset($patch[$k])) { $patch[$k] = (float)$patch[$k]; if ($patch[$k] < 0) fail('값을 확인하세요.'); }
      foreach (['autoApprove', 'enforceHours', 'allowSignup'] as $k) if (isset($patch[$k])) $patch[$k] = (bool)$patch[$k];
      $s = save_settings($patch); audit($a['username'], 'settings', json_encode($patch, JSON_UNESCAPED_UNICODE)); done($s);
    case 'users': need_admin(); done(array_map('user_pub', rows('SELECT * FROM mls_users ORDER BY created_at DESC')));
    case 'userBundle': need_admin(); done(bundle(str($in['id'] ?? '', 24)));
    case 'allBundles': need_admin(); done(array_map(fn($r) => bundle($r['id']), rows("SELECT id FROM mls_users WHERE role<>'admin' ORDER BY created_at DESC")));
    case 'setUserStatus':
      $a = need_admin(); $s = ($in['status'] ?? '') === 'suspended' ? 'suspended' : 'active'; $id = str($in['id'] ?? '', 24);
      if ($id === $a['id']) fail('본인 계정은 정지할 수 없습니다.');
      q('UPDATE mls_users SET status=? WHERE id=?', [$s, $id]); if ($s === 'suspended') q('DELETE FROM mls_sessions WHERE user_id=?', [$id]);
      audit($a['username'], 'status', "$id→$s"); done(true);
    case 'setUserRole':
      $a = need_admin(); $r = in_array($in['role'] ?? '', ['user', 'instructor', 'admin'], true) ? $in['role'] : 'user'; $id = str($in['id'] ?? '', 24);
      if ($id === $a['id']) fail('본인 권한은 변경할 수 없습니다.');
      q('UPDATE mls_users SET role=? WHERE id=?', [$r, $id]); audit($a['username'], 'role', "$id→$r"); done(true);
    case 'adjustCash':
      $a = need_admin(); $amt = round((float)($in['amount'] ?? 0)); if (!$amt) fail('금액을 입력해 주세요.');
      $id = uid('c'); q("INSERT INTO mls_cashflows (id,user_id,type,amount,memo,status,at) VALUES (?,?,?,?,?,'pending',NOW())", [$id, str($in['id'] ?? '', 24), $amt > 0 ? 'deposit' : 'withdraw', abs($amt), '[관리자 조정] ' . str($in['memo'] ?? '', 100)]);
      apply_cash(['id' => $id], true, $a['username']); audit($a['username'], 'adjustCash', ($in['id'] ?? '') . " $amt"); done(true);
    case 'cashflows':
      need_admin(); done(array_map(fn($c) => map_cash($c) + ['username' => $c['username'], 'name' => $c['name']], rows('SELECT c.*, u.username, u.name FROM mls_cashflows c LEFT JOIN mls_users u ON u.id=c.user_id ORDER BY c.at DESC LIMIT 2000')));
    case 'processCash':
      $a = need_admin(); $c = row('SELECT * FROM mls_cashflows WHERE id=?', [str($in['id'] ?? '', 24)]); if (!$c || $c['status'] !== 'pending') fail('처리할 수 없는 신청입니다.');
      apply_cash($c, !empty($in['approve']), $a['username'], str($in['memo'] ?? '', 100)); done(true);
    case 'stats':
      need_admin();
      done(['logins' => array_map(fn($l) => ['userId' => $l['user_id'], 'at' => iso($l['at'])], rows('SELECT user_id, at FROM mls_logins WHERE at > DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY at DESC LIMIT 5000')),
        'audit' => array_map(fn($x) => ['at' => iso($x['at']), 'by' => $x['by_user'], 'action' => $x['action'], 'detail' => $x['detail']], array_reverse(rows('SELECT * FROM mls_audit ORDER BY id DESC LIMIT 200')))]);
    case 'exportDB':
      need_admin(); $out = [];
      foreach (['mls_users', 'mls_positions', 'mls_orders', 'mls_fills', 'mls_cashflows', 'mls_posts', 'mls_comments', 'mls_likes', 'mls_notices', 'mls_snapshots', 'mls_kv'] as $t) $out[$t] = rows("SELECT * FROM $t");
      foreach ($out['mls_users'] as &$u) unset($u['pw']);
      done($out);
    default: fail('알 수 없는 요청입니다.', 404);
  }
} catch (PDOException $e) {
  error_log('[mls] ' . $e->getMessage()); fail('데이터베이스 오류가 발생했습니다.', 500);
} catch (Throwable $e) {
  error_log('[mls] ' . $e->getMessage()); fail('서버 오류가 발생했습니다.', 500);
}
