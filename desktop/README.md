# MAX라이프 주식 — PC 프로그램

웹 버전(https://whaleguard.github.io/maxlife-stock/)과 같은 서버·계좌를 쓰는 Electron 데스크톱 앱입니다.

- 새 창(Ctrl+N)으로 차트·주문을 여러 창에 배치
- 트레이 상주, 윈도우/맥 알림, 자동 업데이트(GitHub Releases)
- 웹 단축키 + F5/Ctrl+R 새로고침, F11 전체 화면

## 새 버전 배포
`package.json` 의 `version` 을 올려 main 에 push → Actions 가 Windows(.exe)·macOS(.dmg)를 빌드해 Releases 에 올립니다.
