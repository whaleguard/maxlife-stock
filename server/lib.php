<?php
// MAX라이프 주식 — 서버 공용 라이브러리 (DB · 시세 · 체결 엔진)
declare(strict_types=1);

const MLS_DEF = ['feeKr' => 0.015, 'feeUs' => 0.25, 'taxKr' => 0.20, 'initialCash' => 10000000, 'autoApprove' => false, 'enforceHours' => false, 'allowSignup' => true, 'maxDeposit' => 100000000, 'minOrderKrw' => 0, 'overrides' => ['hidden' => [], 'base' => []]];

function cfg(?string $k = null) {
  static $c = null;
  if ($c === null) {
    $f = __DIR__ . '/config.php';
    if (!is_file($f)) fail('config.php 가 없습니다. config.sample.php 를 복사해 설정하세요.', 500);
    $c = require $f;
  }
  return $k === null ? $c : ($c[$k] ?? null);
}
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $d = cfg('db');
  $pdo = new PDO("mysql:host={$d['host']};dbname={$d['name']};charset=utf8mb4", $d['user'], $d['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  $pdo->exec("SET time_zone = '+09:00'");
  return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function row(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r ?: null; }
function rows(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function uid(string $p = ''): string { return $p . base_convert((string)(int)(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4)); }
function now(): string { return date('Y-m-d H:i:s'); }
function iso(?string $dt): ?string { return $dt ? date('c', strtotime($dt)) : null; }
function fail(string $msg, int $code = 400): void { http_response_code($code); echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE); exit; }
function done($data = null): void { echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE); exit; }

// ── 설정 ──
function settings(): array {
  static $s = null; if ($s !== null) return $s;
  $r = row("SELECT v FROM mls_kv WHERE k='settings'");
  $s = array_merge(MLS_DEF, $r ? (json_decode($r['v'], true) ?: []) : []);
  return $s;
}
function save_settings(array $patch): array {
  $s = array_merge(settings(), $patch);
  q("REPLACE INTO mls_kv (k, v) VALUES ('settings', ?)", [json_encode($s, JSON_UNESCAPED_UNICODE)]);
  return $s;
}

// ── 시세 ──
function http_get(string $url): ?string {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'maxlife-stock-server']);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ($r !== false && $code === 200) ? $r : null;
  }
  $r = @file_get_contents($url); return $r === false ? null : $r;
}
function cached_json(string $key, string $url, int $ttl) {
  $dir = cfg('cache_dir'); if (!is_dir($dir)) @mkdir($dir, 0775, true);
  $f = "$dir/$key.json";
  if (is_file($f) && time() - filemtime($f) < $ttl) return json_decode((string)file_get_contents($f), true);
  $r = http_get($url . (strpos($url, '?') === false ? '?' : '&') . 't=' . floor(time() / 30));
  if ($r && ($j = json_decode($r, true))) { @file_put_contents($f, $r, LOCK_EX); return $j; }
  return is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
}
function quotes(): array {
  static $q = null; if ($q !== null) return $q;
  $q = cached_json('quotes', cfg('quotes_url'), 55) ?: ['items' => [], 'books' => [], 'fx' => 1400];
  return $q;
}
function quote(string $code): ?array { $q = quotes(); return $q['items'][$code] ?? null; }
function is_live(): bool { $q = quotes(); return ($q['source'] ?? '') === 'KIS' && count($q['items'] ?? []) >= 5; }
function fx(): float { return (float)(quotes()['fx'] ?? 1400); }
function to_krw(float $v, string $ccy): float { return $ccy === 'USD' ? $v * fx() : $v; }
function tick_kr(float $p): int { return $p < 2000 ? 1 : ($p < 5000 ? 5 : ($p < 20000 ? 10 : ($p < 50000 ? 50 : ($p < 200000 ? 100 : ($p < 500000 ? 500 : 1000))))); }
function step_price(float $p, string $ccy, int $dir): float {
  if ($ccy === 'USD') return max(0.01, round($p + $dir * 0.01, 2));
  if ($dir > 0) return $p + tick_kr($p);
  $t = tick_kr($p - 1); return max($t, $p - $t);
}
function best_ask(string $code): float {
  $b = quotes()['books'][$code] ?? null; $q = quote($code);
  if ($b && !empty($b['asks'][0][0])) return (float)$b['asks'][0][0];
  return step_price((float)$q['price'], $q['currency'], 1);
}
function best_bid(string $code): float {
  $b = quotes()['books'][$code] ?? null; $q = quote($code);
  if ($b && !empty($b['bids'][0][0])) return (float)$b['bids'][0][0];
  return (float)$q['price'];
}
function kst_session(string $market): bool {
  $t = new DateTime('now', new DateTimeZone('Asia/Seoul')); $day = (int)$t->format('N'); $hm = (int)$t->format('G') * 60 + (int)$t->format('i');
  if ($market === 'KOSPI' || $market === 'KOSDAQ') return $day <= 5 && $hm >= 540 && $hm < 930;
  $ny = new DateTime('now', new DateTimeZone('America/New_York')); $nd = (int)$ny->format('N'); $nhm = (int)$ny->format('G') * 60 + (int)$ny->format('i');
  return $nd <= 5 && $nhm >= 570 && $nhm < 960;
}
function fee_rate(array $st, string $ccy): float { return ($ccy === 'USD' ? $st['feeUs'] : $st['feeKr']) / 100; }
function tax_rate(array $st, string $ccy): float { return $ccy === 'USD' ? 0 : $st['taxKr'] / 100; }

// ── 계좌 ──
function user_pub(array $u): array {
  return ['id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'], 'status' => $u['status'], 'phone' => $u['phone'], 'email' => $u['email'],
    'cash' => (float)$u['cash'], 'initial' => (float)$u['initial'], 'watch' => json_decode($u['watch'] ?: '[]', true) ?: [], 'createdAt' => iso($u['created_at']), 'lastLogin' => iso($u['last_login'])];
}
function map_order(array $o): array { return ['id' => $o['id'], 'userId' => $o['user_id'], 'code' => $o['code'], 'name' => $o['name'], 'side' => $o['side'], 'type' => $o['type'], 'price' => (float)$o['price'], 'qty' => (int)$o['qty'], 'filled' => (int)$o['filled'], 'avgFill' => $o['avg_fill'] !== null ? (float)$o['avg_fill'] : null, 'status' => $o['status'], 'currency' => $o['currency'], 'amended' => (int)$o['amended'], 'createdAt' => iso($o['created_at']), 'updatedAt' => iso($o['updated_at'])]; }
function map_fill(array $f): array { return ['id' => $f['id'], 'orderId' => $f['order_id'], 'userId' => $f['user_id'], 'code' => $f['code'], 'name' => $f['name'], 'side' => $f['side'], 'price' => (float)$f['price'], 'qty' => (int)$f['qty'], 'currency' => $f['currency'], 'fx' => (float)$f['fx'], 'amount' => (float)$f['amount'], 'fee' => (float)$f['fee'], 'tax' => (float)$f['tax'], 'pnl' => (float)$f['pnl'], 'at' => iso($f['at'])]; }
function map_cash(array $c): array { return ['id' => $c['id'], 'userId' => $c['user_id'], 'type' => $c['type'], 'amount' => (float)$c['amount'], 'memo' => $c['memo'], 'adminMemo' => $c['admin_memo'], 'status' => $c['status'], 'at' => iso($c['at']), 'processedAt' => iso($c['processed_at']), 'processedBy' => $c['processed_by']]; }
function bundle(string $uid): array {
  $u = row('SELECT * FROM mls_users WHERE id=?', [$uid]); if (!$u) fail('회원을 찾을 수 없습니다.', 404);
  $pos = []; foreach (rows('SELECT * FROM mls_positions WHERE user_id=? AND qty>0', [$uid]) as $p) $pos[$p['code']] = ['qty' => (int)$p['qty'], 'avg' => (float)$p['avg'], 'cost' => (float)$p['cost']];
  return [
    'user' => user_pub($u), 'positions' => (object)$pos,
    'orders' => array_map('map_order', rows('SELECT * FROM mls_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 1000', [$uid])),
    'fills' => array_map('map_fill', rows('SELECT * FROM mls_fills WHERE user_id=? ORDER BY at DESC LIMIT 2000', [$uid])),
    'cashflows' => array_map('map_cash', rows('SELECT * FROM mls_cashflows WHERE user_id=? ORDER BY at DESC', [$uid])),
    'snapshots' => array_map(fn($s) => [$s['d'], (float)$s['total']], rows('SELECT d,total FROM mls_snapshots WHERE user_id=? ORDER BY d DESC LIMIT 400', [$uid])),
  ];
}
// 주문가능금액 (예약금·출금대기 차감)
function orderable(string $uid, ?string $excludeOrder = null): float {
  $st = settings(); $u = row('SELECT cash FROM mls_users WHERE id=?', [$uid]);
  $res = 0.0;
  foreach (rows("SELECT * FROM mls_orders WHERE user_id=? AND status='pending' AND side='buy'", [$uid]) as $o) {
    if ($o['id'] === $excludeOrder) continue;
    $res += to_krw((float)$o['price'] * ((int)$o['qty'] - (int)$o['filled']), $o['currency']) * (1 + fee_rate($st, $o['currency']));
  }
  $wd = (float)(row("SELECT COALESCE(SUM(amount),0) s FROM mls_cashflows WHERE user_id=? AND status='pending' AND type='withdraw'", [$uid])['s']);
  return max(0, (float)$u['cash'] - $res - $wd);
}
function sellable(string $uid, string $code, ?string $excludeOrder = null): int {
  $p = row('SELECT qty FROM mls_positions WHERE user_id=? AND code=?', [$uid, $code]); $have = $p ? (int)$p['qty'] : 0;
  $lock = 0; foreach (rows("SELECT id,qty,filled FROM mls_orders WHERE user_id=? AND code=? AND status='pending' AND side='sell'", [$uid, $code]) as $o) if ($o['id'] !== $excludeOrder) $lock += (int)$o['qty'] - (int)$o['filled'];
  return $have - $lock;
}

// ── 체결 엔진 ──
function validate_order(array $user, array $o, ?string $excludeOrder = null): ?string {
  $st = settings();
  if (!is_live()) return '실시세 연결 후 주문할 수 있습니다. (관리자: KIS API 연결 필요)';
  $q = quote($o['code']); if (!$q) return '종목을 찾을 수 없습니다.';
  if (in_array($o['code'], $st['overrides']['hidden'] ?? [], true)) return '거래가 중지된 종목입니다.';
  if ($user['status'] === 'suspended') return '정지된 계정은 주문할 수 없습니다.';
  if (!is_int($o['qty']) || $o['qty'] <= 0 || $o['qty'] > 1000000) return '주문 수량을 확인해 주세요.';
  if (!in_array($o['side'], ['buy', 'sell'], true) || !in_array($o['type'], ['limit', 'market'], true)) return '잘못된 주문입니다.';
  if ($st['enforceHours'] && $o['type'] === 'market' && !kst_session($q['market'])) return '장 운영시간이 아닙니다. 지정가 예약주문을 이용하세요.';
  if ($o['type'] === 'limit') {
    if (!($o['price'] > 0)) return '주문 가격을 입력해 주세요.';
    if ($q['currency'] === 'KRW') {
      if (fmod($o['price'], tick_kr($o['price'])) != 0) return '호가단위(' . tick_kr($o['price']) . '원)에 맞지 않는 가격입니다.';
      if (!empty($q['upper']) && $o['price'] > $q['upper']) return '상한가를 초과했습니다.';
      if (!empty($q['lower']) && $o['price'] < $q['lower']) return '하한가 미만입니다.';
    }
  }
  if ($o['side'] === 'buy') {
    $p = $o['type'] === 'market' ? best_ask($o['code']) * ($q['currency'] === 'USD' ? 1.002 : 1) : $o['price'];
    $need = to_krw($p * $o['qty'], $q['currency']) * (1 + fee_rate($st, $q['currency']));
    if ($need > orderable($user['id'], $excludeOrder) + 0.5) return '주문가능금액이 부족합니다.';
  } else {
    if (sellable($user['id'], $o['code'], $excludeOrder) < $o['qty']) return '매도가능수량이 부족합니다.';
  }
  return null;
}
function execute_fill(array $o, float $price): ?array {
  $st = settings(); $q = quote($o['code']); $ccy = $q['currency']; $fx = $ccy === 'USD' ? fx() : 1.0;
  $qty = (int)$o['qty'] - (int)$o['filled'];
  $gross = $price * $qty * $fx; $fee = round($gross * fee_rate($st, $ccy)); $tax = $o['side'] === 'sell' ? round($gross * tax_rate($st, $ccy)) : 0;
  $pdo = db(); $pdo->beginTransaction();
  try {
    $u = row('SELECT * FROM mls_users WHERE id=? FOR UPDATE', [$o['user_id']]);
    $p = row('SELECT * FROM mls_positions WHERE user_id=? AND code=? FOR UPDATE', [$o['user_id'], $o['code']]) ?: ['qty' => 0, 'avg' => 0, 'cost' => 0];
    $cur = row('SELECT status FROM mls_orders WHERE id=? FOR UPDATE', [$o['id']]);
    if (!$cur || $cur['status'] !== 'pending') { $pdo->rollBack(); return null; }
    $pnl = 0.0;
    if ($o['side'] === 'buy') {
      $total = $gross + $fee; if ($total > (float)$u['cash'] + 0.5) { $pdo->rollBack(); return null; }
      $nq = (int)$p['qty'] + $qty; $navg = ((float)$p['avg'] * (int)$p['qty'] + $price * $qty) / $nq;
      q('UPDATE mls_users SET cash=cash-? WHERE id=?', [$total, $u['id']]);
      q('INSERT INTO mls_positions (user_id,code,qty,avg,cost) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty), avg=VALUES(avg), cost=VALUES(cost)', [$u['id'], $o['code'], $nq, $navg, (float)$p['cost'] + $total]);
    } else {
      if ((int)$p['qty'] < $qty) { $pdo->rollBack(); return null; }
      $proceeds = $gross - $fee - $tax; $costPart = (float)$p['cost'] * ($qty / (int)$p['qty']); $pnl = $proceeds - $costPart;
      q('UPDATE mls_users SET cash=cash+? WHERE id=?', [$proceeds, $u['id']]);
      $nq = (int)$p['qty'] - $qty;
      if ($nq <= 0) q('DELETE FROM mls_positions WHERE user_id=? AND code=?', [$u['id'], $o['code']]);
      else q('UPDATE mls_positions SET qty=?, cost=? WHERE user_id=? AND code=?', [$nq, (float)$p['cost'] - $costPart, $u['id'], $o['code']]);
    }
    $at = now();
    q("UPDATE mls_orders SET status='filled', filled=qty, avg_fill=?, updated_at=? WHERE id=?", [$price, $at, $o['id']]);
    $fid = uid('f');
    q('INSERT INTO mls_fills (id,order_id,user_id,code,name,side,price,qty,currency,fx,amount,fee,tax,pnl,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [$fid, $o['id'], $u['id'], $o['code'], $o['name'], $o['side'], $price, $qty, $ccy, $fx, round($gross), $fee, $tax, round($pnl), $at]);
    $pdo->commit();
    return map_fill(row('SELECT * FROM mls_fills WHERE id=?', [$fid]));
  } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}
function try_fill(array $o): ?array {
  if ($o['status'] !== 'pending' || !is_live()) return null;
  $q = quote($o['code']); if (!$q) return null;
  if (settings()['enforceHours'] && !kst_session($q['market'])) return null;
  $ask = best_ask($o['code']); $bid = best_bid($o['code']); $px = null;
  if ($o['type'] === 'market') $px = $o['side'] === 'buy' ? $ask : $bid;
  elseif ($o['side'] === 'buy' && $ask <= (float)$o['price']) $px = min($ask, (float)$o['price']);
  elseif ($o['side'] === 'sell' && $bid >= (float)$o['price']) $px = max($bid, (float)$o['price']);
  return $px === null ? null : execute_fill($o, $px);
}
// 미체결 주문 일괄 체결 검사 (요청 시 30초 간격 · cron.php 에서도 호출)
function match_pending(bool $force = false): int {
  $last = row("SELECT v FROM mls_kv WHERE k='last_match'");
  if (!$force && $last && time() - (int)$last['v'] < 30) return 0;
  q("REPLACE INTO mls_kv (k,v) VALUES ('last_match', ?)", [(string)time()]);
  $n = 0; foreach (rows("SELECT * FROM mls_orders WHERE status='pending' ORDER BY created_at") as $o) if (try_fill($o)) $n++;
  return $n;
}
function apply_cash(array $c, bool $approve, string $by, string $memo = ''): void {
  $pdo = db(); $pdo->beginTransaction();
  try {
    $c = row('SELECT * FROM mls_cashflows WHERE id=? FOR UPDATE', [$c['id']]);
    if ($c['status'] !== 'pending') { $pdo->rollBack(); fail('이미 처리된 신청입니다.'); }
    if ($approve && $c['type'] === 'withdraw') {
      $u = row('SELECT cash FROM mls_users WHERE id=? FOR UPDATE', [$c['user_id']]);
      $res = 0.0; $st = settings();
      foreach (rows("SELECT * FROM mls_orders WHERE user_id=? AND status='pending' AND side='buy'", [$c['user_id']]) as $o) $res += to_krw((float)$o['price'] * ((int)$o['qty'] - (int)$o['filled']), $o['currency']) * (1 + fee_rate($st, $o['currency']));
      if ((float)$c['amount'] > (float)$u['cash'] - $res) { $approve = false; $memo = '출금가능금액 부족'; }
    }
    q('UPDATE mls_cashflows SET status=?, processed_at=?, processed_by=?, admin_memo=? WHERE id=?', [$approve ? 'approved' : 'rejected', now(), $by, $memo, $c['id']]);
    if ($approve) q('UPDATE mls_users SET cash=cash' . ($c['type'] === 'deposit' ? '+' : '-') . '? WHERE id=?', [(float)$c['amount'], $c['user_id']]);
    $pdo->commit();
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function audit(string $by, string $action, string $detail = ''): void { q('INSERT INTO mls_audit (at,by_user,action,detail) VALUES (?,?,?,?)', [now(), $by, $action, mb_substr($detail, 0, 500)]); }
function mask_name(string $s): string { $l = mb_strlen($s); if ($l <= 1) return $s; if ($l === 2) return mb_substr($s, 0, 1) . '*'; return mb_substr($s, 0, 1) . str_repeat('*', $l - 2) . mb_substr($s, -1); }
