# CLAUDE.md

LocalTotal: 파일 내용을 PC 밖으로 보내지 않는 로컬 수동 악성코드 검사기. macOS 1차(M0~M6) 완료, 현재 Windows 지원(M7) 작업 중.
상세 설계는 `docs/LocalTotal 프로젝트설계도 (macOS 우선) *.md` (docs/는 .gitignore로 제외, 로컬에만 있음).

## 절대 원칙

1. **macOS 동작은 절대 깨지면 안 된다.**
   - OS별로 다른 부분만 분리한다: clamd 실행 스크립트, ClamAV 설정(`config/clamav/`), Defender 엔진.
   - 공통 코드(검사 흐름, 판정, 격리, 제외, 설정, 저장, 보안 미들웨어, 웹 UI)는 그대로 쓴다. OS 분기가 필요하면 엔진 어댑터나 작은 헬퍼(`common/app-paths.ts` 같은) 안에만 둔다.
   - macOS용 기존 파일·경로·명령(`config/clamav/*.conf`, `npm run dev`, `npm run dev:app`)의 위치와 동작을 바꾸지 않는다. Windows용은 옆에 추가한다.
   - 루트 `package.json`의 `dev`, `dev:clam`은 **실행 구조까지 그대로 둔다**(다른 진입점으로 감싸거나 OS 분기를 넣지 않는다). Windows는 별도 스크립트 `dev:win`, `dev:clam:win`으로 추가해서 맥을 다시 확인할 필요가 없게 한다.
   - 공통 코드를 고치면 macOS에서 결과가 이전과 같은지 단위 테스트로 보장한다(Defender 결과가 없을 때 판정이 기존과 동일해야 함).
   - 방법: OS 차이는 `platform` 인자를 받는 순수 함수로 분리하고(`common/fs-errors.ts`, `common/input-path.ts`, web `lib/paths.ts`, `lib/platform.ts`), spec에 **M7 이전 구현을 그대로 복사**해 `'darwin'`에서 결과가 같은지 비교한다. 이 복사본은 고치지 않는다.
2. **파일 내용은 외부로 보내지 않는다.** VirusTotal에는 SHA-256 해시만 보낸다(`GET /api/v3/files/{sha256}`). 업로드 코드는 만들지 않는다. Defender도 샘플 자동 제출이 일어나지 않게 해야 한다(아래 Windows 메모 참고).
3. **모든 서버는 `127.0.0.1`에만 바인딩한다.** API 4000, 웹 3000, clamd 3310. `0.0.0.0`·`localhost` 와일드카드 바인딩 금지. `local-only.middleware.ts`(Host·Origin 검사, 변경 요청에 `X-LocalTotal: 1`)를 약화시키지 않는다.
4. **기능을 바꾸면 문서도 같이 업데이트한다.** `README.md`와 `docs/`(설계도 .md의 해당 섹션·로드맵 상태, 작업일지 `docs/작업일지.md`에 날짜별 기록). docs/는 git에 올라가지 않는다.

그 밖의 설계 원칙: 검사는 판정만 하고 격리는 사용자가 버튼을 눌렀을 때만 한다. 제외 목록 파일은 격리할 수 없다. 실시간 감시 없음(clamd는 앱을 켜 둔 동안만). 검사 결과·VT 캐시는 메모리에만 두고 사용자 조작(격리·제외·설정)만 JSON으로 저장한다. 검사 파일은 읽기만 하고 실행하지 않는다.

## 구조

```text
package.json            # npm workspaces + concurrently. dev = clam + api + web
config/clamav/          # macOS 전용 clamd.conf, freshclam.conf (/opt/homebrew 경로)
apps/api/src/           # NestJS 12, 127.0.0.1:4000
  main.ts               # CORS(http://127.0.0.1:3000), localOnly, 바인딩
  common/               # app-paths(OS별 데이터 폴더), file-hash, local-only.middleware
  store/json-file.ts    # 임시 파일 → rename 원자적 쓰기 + 직렬화 큐
  engines/              # scan-engine.interface(EngineName에 'defender' 이미 있음), clamav, virustotal, engines.service
  scans/                # verdict.ts(판정 규칙), scans.service(파일 1개), scan-jobs.service(폴더·동시성 4·SSE)
  quarantine/ exclusions/ settings/
apps/web/src/           # Next.js 16 App Router + Tailwind v4, 127.0.0.1:3000. 표시만 담당
```

데이터 폴더: macOS `~/Library/Application Support/LocalTotal/`, Windows `%APPDATA%\LocalTotal\` (`appDataDir()`).

## 명령

```bash
npm install                 # 루트에서 한 번
npm run dev                 # clamd + API + 웹 (macOS)
npm run dev:win             # clamd + API + 웹 (Windows, M7에서 추가)
npm run dev:app             # API + 웹만 (공통)
npm test -w apps/api        # Jest 단위 테스트 (verdict, exclusion-matcher, fs-errors, input-path)
npm test -w apps/web        # node --test (paths, platform). 새 의존성 없이 Node 24 타입 제거 실행
npm run lint -w apps/api    # oxlint
```

- Node 24.9 이상 필요(NestJS 12가 ESM). jest는 루트 node_modules에 설치되어 test 스크립트가 `../../node_modules/jest/bin/jest.js`를 직접 부른다.
- `isolatedModules` 때문에 데코레이터 시그니처에 쓰는 타입은 `import type`으로 가져온다.

## Git 규칙

- Windows(M7) 작업은 `feat/windows` 브랜치에서 한다. main에 직접 커밋하지 않는다.
- **단계가 끝날 때마다 커밋한다.** 메시지는 `M7 n단계: 요약` 형식에 변경 내용과 확인 결과를 적는다. 단계와 관계없는 변경(예: `package-lock.json` 동기화)은 따로 커밋한다.
- 커밋에는 그 단계의 파일만 명시적으로 넣는다(`git add -A` 금지). `.vscode/`, `.env`, `docs/`는 커밋하지 않는다.
- 공통 코드를 고치는 단계는 커밋 전에 `npm test -w apps/api`가 통과해야 한다.
- push는 사용자가 요청할 때만 한다.

## 코드 규칙

- 에러 응답은 `{ code, message }` 형태(예: `EXCLUDED`, `FILE_CHANGED`, `FILE_BUSY`, `NO_PERMISSION`). 사용자에게 보이는 메시지는 한국어.
- 판정 로직은 백엔드(`verdict.ts`)에만 둔다. 판정 규칙을 바꾸면 `verdict.spec.ts`도 고친다.
- 로그에는 경로와 판정만 남기고 파일 내용·API 키는 남기지 않는다.
- 외부 엔진은 npm 래퍼 없이 직접 호출한다(clamd는 `net` 소켓 INSTREAM).
- 새 의존성은 꼭 필요할 때만, 네이티브 모듈은 쓰지 않는다.

## Windows(M7) 메모

ClamAV (Windows)
- 설치: `winget install --id Cisco.ClamAV -e`(1.5.4, 맥과 같은 버전). 대안은 clamav.net 공식 MSI. Homebrew 경로를 가정하지 않는다.
- winget 설치 위치는 `C:\Program Files\ClamAV\`이고 **PATH에 등록되지 않는다**. 설치본의 기본 설정(`clamd.conf`)은 만들지도 고치지도 않는다.
- 실행 파일 찾는 순서: `CLAMAV_DIR` → PATH → `%ProgramFiles%\ClamAV\`. 못 찾으면 설치 안내를 출력하고, API·웹은 그대로 뜨게 한다.
- `CLAMAV_DIR` 읽는 곳: ① 프로세스 환경 변수 → ② `apps/api/.env`. `.env`는 `util.parseEnv`로 `CLAMAV_DIR` 하나만 꺼내고, VT 키 같은 다른 값은 clamd 실행 프로세스 환경에 싣지 않는다. 기본 설치라면 비워 둬도 된다.
- 시그니처 DB: `%LOCALAPPDATA%\LocalTotal\clamav\db\` (Program Files는 일반 권한으로 쓸 수 없고, 수백 MB라 Roaming에 두지 않음). 격리·JSON은 기존대로 `%APPDATA%\LocalTotal\`.
- 설정: `config/clamav/windows/clamd.conf`, `freshclam.conf`(고정 파일, DB 경로 없음). DB 경로는 clamd·freshclam 1.5.4의 `--datadir` 옵션으로 넘긴다(템플릿 생성 불필요). `TCPAddr 127.0.0.1`, `TCPSocket 3310`, 크기 한도는 맥 설정과 같다.
- 실행: `dev:clam:win`(freshclam `--quiet` 갱신 → 실패해도 기존 DB로 → `clamd --foreground`), `dev:win` = `dev:clam:win` + `dev:api` + `dev:web`. freshclam은 `--quiet` 없이 돌리면 진행률 출력이 수 MB가 된다.
- clamd를 Windows 서비스로 등록하지 않는다(`--install-service` 금지, 실시간 감시 없음 원칙). winget 설치는 서비스·예약 작업을 만들지 않는 것을 확인했다. 사용자가 직접 서비스를 등록해 3310이 점유된 경우를 대비해 `dev:clam:win`이 시작 전에 포트를 확인하고, README에 `clamd --uninstall-service` 안내를 적는다.
- EICAR 시그니처 이름은 DB에 따라 `Eicar-Test-Signature`(Windows 1.5.4/28178에서 확인) 또는 `Win.Test.EICAR_HDB-1`(macOS). 이름에 의존하지 말 것.

Defender
- Defender 엔진은 `MpCmdRun.exe -Scan -ScanType 3 -File <경로> -DisableRemediation`를 `child_process.execFile`(셸 없이, 인자 배열)로 호출한다. 경로를 셸 문자열로 이어 붙이지 않는다.
- 출력 형식과 종료 코드는 추측하지 말고 실제 측정값(작업일지에 기록)을 기준으로 파싱한다. 측정 결과(4.18.26100.4):
  - 종료 코드 0 = 위협 없음, **2 = 위협 발견 또는 오류**(없는 파일도 2) → 종료 코드만으로 판정 금지, stdout 파싱.
  - `found no threats.` → clean / `found N threats.` + `Threat                  : <이름>` 줄 → malicious / `CmdTool: Failed with hr = 0x…` 등 → error.
  - stdout은 ASCII뿐이고 경로의 한글 등은 `?`로 깨진다 → 출력 속 경로를 비교하지 않는다. 줄바꿈 `\r\n`.
  - `-DisableRemediation`이면 파일이 남고 Defender 기록에도 안 남는다. 1개 25~70ms, 동시 4개 문제없음.
  - Defender 제외 목록 조회·추가는 관리자 권한이 필요하다.
- 실시간 보호가 켜져 있으면 EICAR 같은 파일은 만들자마자 Defender가 지울 수 있다. 테스트 시 고려한다.
- 샘플 제출(결정됨): `SubmitSamplesConsent` 2 → 사용, 0 → 사용 + 안내(info), 1·3·확인 불가 → **Defender 끔** + 설정 방법 안내(warn). 읽는 순서: 정책 레지스트리 → `HKLM\SOFTWARE\Microsoft\Windows Defender\Spynet` → `Get-MpPreference`. 1분 캐시. 구현은 `engines/defender-output.ts`의 `defenderPolicy`.
- 판정(결정됨): ClamAV·Defender 중 하나라도 탐지 → 위험. **로컬 엔진(ClamAV·Defender) 중 하나라도 정상 검사했고 아무도 탐지하지 않았으면 깨끗함, 둘 다 실패하면 오류**(VT 근거가 있으면 VT 판정이 먼저). Defender 결과가 없으면(맥) 로컬 엔진은 ClamAV뿐이라 M7 이전과 동일.
- 엔진별 오류는 판정과 별개로 결과 카드에 보인다. 로컬 엔진 오류가 있는 "깨끗함"은 접힌 목록이 아니라 카드로 표시한다(web `lib/results.ts`의 `hasLocalEngineError`, VT 오류는 제외해 맥 화면 유지).
- Defender 제외 폴더: `MpCmdRun -Scan -ScanType 3 -File`은 제외 목록을 **적용하지 않고** 검사한다(4.18.26100.4 실측, 출력·로그가 일반 폴더와 동일). 실시간 보호만 제외를 따른다. 동작이 바뀌어도 출력으로는 구분할 수 없으므로 Defender 업데이트 후 작업일지의 재현 절차로 다시 확인한다. "탐지 파일만" VT 모드는 ClamAV·Defender 중 하나라도 탐지하면 조회.
- Defender는 Windows에서만 엔진 목록에 들어간다(`activeEngines`). 크기 제한(`maxFileSizeMb`)은 ClamAV에만 적용하고 Defender는 크기와 관계없이 검사한다.
- Windows 특이점: 파일 잠금(`EBUSY`/`EPERM`), 경로 구분자 `\`(웹에서 `split("/")` 금지 → `lib/paths.ts`의 `fileName`/`lastSegment`), 탐색기 "경로로 복사"의 따옴표(API `normalizeInputPath`가 처리), `chmod`는 읽기 전용 속성만 바뀜, `rename` 대상이 잠겨 있으면 실패할 수 있음.
- 화면의 OS별 문구는 `lib/platform.ts`의 `osTexts`에 모으고 컴포넌트는 `useOsTexts()`로 읽는다(Next 서버의 `process.platform`을 layout에서 전달). 문구를 하드코딩하지 않는다.
- PowerShell 5.1의 `Set-Content -Encoding utf8`은 BOM을 붙인다. JSON 등을 고칠 때 쓰지 않는다.
- Defender가 차단한 파일을 열면 Node는 `code: 'UNKNOWN'`, `errno: -4094`를 낸다(Win32 오류 225 "file contains a virus"). 실시간 보호는 파일 생성 직후가 아니라 나중에 다른 프로세스가 열 때 반응할 수 있다.
- PowerShell 5.1 기본 셸이고 npm 스크립트는 `cmd.exe`로 실행된다. `sh -c` 스크립트는 Windows에서 동작하지 않는다.
