<?php
// config.sample.php 를 config.php 로 복사한 뒤 값을 채우세요. (config.php 는 git 에 올리지 마세요)
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'DB이름',
    'user' => 'DB아이디',
    'pass' => 'DB비밀번호',
  ],
  // 프론트엔드가 올라간 주소 (CORS 허용). 같은 도메인이면 비워둬도 됩니다.
  'allow_origins' => [
    'https://whaleguard.github.io',
  ],
  // 시세 데이터 (GitHub Actions 가 갱신하는 data 브랜치)
  'quotes_url' => 'https://raw.githubusercontent.com/whaleguard/maxlife-stock/data/quotes.json',
  'universe_url' => 'https://raw.githubusercontent.com/whaleguard/maxlife-stock/main/data/universe.json',
  'cache_dir' => __DIR__ . '/cache',
  // install.php 실행 시 생성할 최초 관리자
  'admin' => ['username' => 'admin', 'password' => '변경하세요!', 'name' => '관리자'],
];
