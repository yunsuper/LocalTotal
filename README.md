# LocalTotal

> 파일 내용은 내 Mac 밖으로 나가지 않는, 로컬 수동 악성코드 검사 도구

LocalTotal은 내 컴퓨터에서 **ClamAV**로 파일을 검사하고, **VirusTotal**에는 파일 대신 **SHA-256 해시만** 조회해 결과를 합쳐 보여주는 개인용 웹 앱입니다. 게임 모드처럼 출처가 다양한 파일을 받았을 때 "이거 열어도 되나?"를 빠르게 확인하는 용도로 만들었습니다.

- 현재 지원: **macOS** (Apple Silicon 기준)
- 예정: Windows (Microsoft Defender 연동)

> ⚠️ LocalTotal은 실시간 백신을 대체하지 않습니다. 의심 파일을 수동으로 확인하는 보조 도구입니다.

## 스크린샷

| 검사 화면 | 검사 결과 |
| :---: | :---: |
| <img width="400" alt="검사 화면" src="https://github.com/user-attachments/assets/3df2cadd-cea8-44b4-afc7-d25f0b03a41a" /> | <img width="400" alt="검사 결과" src="https://github.com/user-attachments/assets/69fe3633-e78c-4ef5-a8af-91e408b2364d" /> |

> 결과 예시: EICAR 테스트 파일을 ClamAV와 VirusTotal(60/62)이 모두 탐지해 **위험**으로 판정. 이 파일은 제외 목록에 "오탐으로 등록"해 두어 **오탐 의심** 배지가 붙고 격리 대상에서 빠진 상태입니다.


## 주요 특징

- **파일은 외부로 전송하지 않음** — VirusTotal에는 해시만 보냅니다. 업로드 기능은 코드에 아예 없습니다.
- **파일·폴더 검사** — 여러 경로를 한 번에 넣고, 진행률을 실시간(SSE)으로 확인합니다.
- **판정 합산** — ClamAV 결과와 VirusTotal 탐지 수를 합쳐 위험 / 주의 / 의심 / 깨끗함으로 표시합니다.
- **수동 격리·복원** — 사용자가 버튼을 눌렀을 때만 격리합니다. 격리 파일은 실행 권한을 제거해 보관하고, 원래 위치로 복원할 수 있습니다.
- **제외 목록** — 오탐이 잦은 폴더(MO2 등)·파일·해시를 등록해 실수로 격리하지 않게 합니다. 결과 화면에서 "오탐으로 등록"도 가능합니다.
- **로컬 전용** — 모든 서버가 `127.0.0.1`에만 열리고, 다른 웹사이트가 로컬 API를 호출하지 못하도록 막습니다.
- **기록을 남기지 않음** — 검사 결과는 앱을 켜 둔 동안 메모리에만 있습니다.
- 라이트 / 다크 테마

## 요구 사항

| 항목 | 버전 |
| --- | --- |
| macOS | Apple Silicon 권장 (Intel은 아래 참고) |
| Node.js | 22 이상 (v24에서 확인) |
| Homebrew | 최신 |
| ClamAV | 1.5 이상 (Homebrew로 설치) |
| VirusTotal API 키 | 선택 (무료 키 가능) |

## 설치

아래 명령은 모두 **macOS 터미널** 기준입니다.

### 1. ClamAV 설치

```bash
brew install clamav
```

ClamAV 설정은 레포의 `config/clamav/` 파일을 그대로 사용하므로, Homebrew 쪽 설정 파일을 따로 만들 필요가 없습니다. 시그니처 DB는 첫 실행 때 자동으로 내려받습니다(수백 MB, 몇 분 걸릴 수 있음).

### 2. 레포 받기 & 패키지 설치

```bash
git clone https://github.com/yunsuper/LocalTotal.git
cd LocalTotal
npm install
```

루트에서 한 번만 설치하면 `apps/api`, `apps/web`까지 함께 설치됩니다.

### 3. 환경 변수 설정

```bash
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env`를 열어 VirusTotal API 키를 넣습니다.

```env
VT_API_KEY=여기에_내_키
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
```

- 키는 [VirusTotal](https://www.virustotal.com/) 가입 후 프로필 → API Key에서 발급합니다.
- 키를 비워 두면 ClamAV만으로 검사합니다.
- `.env`는 git에서 제외되어 있습니다. **키를 커밋하거나 공유하지 마세요.**

### 4. (선택) 전체 디스크 접근 권한

다운로드·문서·데스크탑 폴더를 검사하려면, `npm run dev`를 실행하는 앱(VS Code, iTerm, 터미널 등)에 권한을 줍니다.

시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한 → 해당 앱 켜기

권한이 없으면 해당 파일은 `EPERM` 오류로 표시됩니다.

## 실행

```bash
npm run dev
```

ClamAV 시그니처 갱신 → `clamd` 실행 → API 서버 → 웹 화면이 한 번에 시작됩니다.

1. 브라우저에서 **http://127.0.0.1:3000** 접속
2. 상단 ClamAV 배지가 회색 → 초록으로 바뀌면 검사 가능 (시그니처 로딩에 수십 초 걸릴 수 있음)
3. 종료는 터미널에서 `Ctrl + C` — clamd·API·웹이 함께 종료됩니다

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | clamd + API + 웹 전체 실행 (기본) |
| `npm run dev:app` | clamd를 따로 띄웠을 때 API + 웹만 실행 |

## Windows에서 실행 (개발 중)

> Windows 지원은 개발 중입니다. 현재 ClamAV + Microsoft Defender + VirusTotal 검사, 격리·복원이 동작하는 것을 확인했습니다. 아래 명령은 **PowerShell** 기준입니다.

1. ClamAV 설치 (1.5 이상)

   ```powershell
   winget install --id Cisco.ClamAV -e
   ```

   `C:\Program Files\ClamAV\`에 설치됩니다. PATH 등록이나 설정 파일 작성은 필요 없습니다. 다른 위치에 설치했다면 `apps/api/.env`에 `CLAMAV_DIR=<설치 폴더>`를 적습니다.

2. 레포 받기·패키지 설치·환경 변수는 macOS와 같습니다 (`cp` 대신 `Copy-Item apps/api/.env.example apps/api/.env`).

3. 실행

   ```powershell
   npm run dev:win
   ```

   - 시그니처 DB는 `%LOCALAPPDATA%\LocalTotal\clamav\db\`에 받습니다(첫 실행 시 약 110MB). 관리자 권한은 필요 없습니다.
   - 설정은 레포의 `config/clamav/windows/`를 사용하고, ClamAV 설치 폴더의 설정은 건드리지 않습니다.
   - `Ctrl + C`로 clamd·API·웹이 함께 종료됩니다. 이어서 `Terminate batch job (Y/N)?`(한국어 환경은 `일괄 작업을 끝내시겠습니까`)가 나오면 `Y`를 누르면 됩니다(npm의 Windows 기본 동작).
   - clamd는 실행하는 동안에만 동작합니다. `clamd --install-service`로 서비스 등록은 하지 마세요. 이미 등록해서 3310 포트를 쓰고 있다면 관리자 터미널에서 `clamd.exe --uninstall-service`로 해제합니다.

데이터는 `%APPDATA%\LocalTotal\`(격리·제외·설정)에 저장됩니다.

**Microsoft Defender**: Windows에 기본으로 있는 Defender로도 검사합니다(`MpCmdRun.exe -Scan -ScanType 3 -File <경로> -DisableRemediation`). 추가 설치는 없고, Defender가 파일을 지우거나 격리하지 않으며 판정만 받아 옵니다. 파일 내용을 외부로 보내지 않는 원칙에 따라 **샘플 제출 설정**에 맞춰 동작합니다.

| Defender 샘플 제출 (`SubmitSamplesConsent`) | LocalTotal |
| --- | --- |
| 2 보내지 않음 | Defender 사용 |
| 0 보내기 전에 확인 (Windows 기본, 자동 샘플 제출 꺼짐) | Defender 사용 + 안내 표시. Windows가 파일 전송을 물으면 "보내지 않음"을 선택 |
| 1·3 자동 전송 (자동 샘플 제출 켜짐) | **Defender 검사를 끔** + 설정 방법 안내 |

현재 값 확인과 "보내지 않음" 설정(관리자 PowerShell):

```powershell
Get-MpPreference | Select-Object SubmitSamplesConsent
Set-MpPreference -SubmitSamplesConsent 2
```

또는 Windows 보안 → 바이러스 및 위협 방지 → 설정 관리 → "자동 샘플 제출"을 끕니다(값 0). 바꾸면 1분 안에 반영됩니다.

**경로 입력**: 파일 탐색기에서 파일이나 폴더를 선택하고 `Ctrl + Shift + C`(경로로 복사)로 복사해 붙여넣습니다. 앞뒤에 붙는 큰따옴표는 자동으로 지웁니다.

**"파일을 열 수 없음 (Windows 보안 등의 이유일 수 있음)"**: Microsoft Defender 같은 보안 프로그램이 파일 열기를 막았을 때 주로 나옵니다(다른 원인일 수도 있음). 이 파일은 LocalTotal이 읽을 수 없어 격리도 할 수 없습니다(`409 FILE_UNREADABLE`). Windows 보안 → 바이러스 및 위협 방지 → 보호 기록에서 처리 결과를 확인하세요.

## 사용법

### 검사

1. Finder에서 파일이나 폴더를 선택하고 `Option + Command + C`로 경로를 복사합니다.
2. 검사 화면 입력창에 붙여넣습니다(여러 줄 = 여러 경로).
3. **검사 시작**을 누르면 진행률과 판정별 개수가 실시간으로 표시됩니다.

> 브라우저 보안상 드래그 앤 드롭으로는 파일의 실제 경로를 알 수 없어 경로 붙여넣기 방식을 사용합니다.

### 판정 기준

위에서부터 먼저 맞는 판정이 적용됩니다.

| 판정 | 조건 |
| --- | --- |
| 🔴 위험 | ClamAV 탐지, Defender 탐지(Windows), 또는 VirusTotal malicious 5개 이상 |
| 🟠 주의 | VirusTotal malicious 3~4개 |
| 🟡 의심 | VirusTotal malicious 1~2개, 또는 suspicious 1개 이상 |
| ⚪ 오류 | 로컬 엔진이 하나도 검사하지 못함 (크기 초과, 읽기 권한 없음, ClamAV 오류 등. Windows는 ClamAV·Defender 둘 다 실패) |
| 🟢 깨끗함 | 위 조건 해당 없음 (VirusTotal 미등록 포함) |
| 🔵 제외됨 | 제외 목록의 "건너뛰기" 규칙에 해당 |

Windows에서는 ClamAV와 Defender 중 **하나라도 정상 검사했고 아무도 탐지하지 않았으면 깨끗함**, 둘 다 실패하면 오류입니다. 예를 들어 ClamAV가 크기 제한으로 건너뛰었어도 Defender가 검사해 깨끗하면 깨끗함입니다. 이렇게 한쪽 엔진에 오류가 있는 파일은 "깨끗한 파일" 목록에 접지 않고 결과 카드로 보여 주므로 엔진별 오류를 확인할 수 있습니다.

Defender 제외 목록에 넣은 폴더(예: ModOrganizer, 게임 폴더)도 LocalTotal의 Defender 검사는 건너뛰지 않습니다(`MpCmdRun` 수동 검사는 제외 목록을 적용하지 않는 것을 확인함, Defender 4.18.26100.4). 실시간 보호만 제외됩니다.

### VirusTotal 조회 방식

무료 API 제한(분당 4회, 하루 500회)에 맞춰 자동으로 조회 범위를 정합니다.

| 상황 | 동작 |
| --- | --- |
| 검사 대상 파일이 **30개 이하** | 모든 파일 해시 조회 (30개면 약 8분) |
| 30개 **초과** | ClamAV가 탐지한 파일만 조회 (Windows는 ClamAV·Defender 중 하나라도 탐지한 파일) |
| VT 꺼짐 또는 키 없음 | 조회 안 함 (외부 통신 없음) |

- 기준 개수(기본 30)는 설정 화면에서 바꿀 수 있습니다.
- 같은 해시는 24시간 동안 캐시에서 답하고, 하루 480회에서 자동으로 멈춥니다.
- 상단 배지에서 "오늘 n/500" 사용량을 확인할 수 있습니다.

### 격리 · 복원

- 결과 카드의 **격리** 버튼으로 파일을 격리합니다. 검사 이후 파일이 바뀌었으면 격리하지 않습니다.
- 격리 파일은 `~/Library/Application Support/LocalTotal/quarantine/`에 실행 권한 없이(`0400`) 보관됩니다.
- **격리함** 화면에서 원래 위치로 복원하거나 영구 삭제할 수 있습니다. 같은 이름이 있으면 `이름 (복원).확장자`로 복원됩니다.

### 제외 목록

**설정** 화면에서 관리합니다.

| 모드 | 동작 |
| --- | --- |
| 검사만 (기본) | 검사는 하되, 탐지되면 "오탐 의심"으로 표시하고 격리 버튼을 숨김 |
| 건너뛰기 | 검사하지 않음. 폴더는 하위까지 탐색하지 않음 |

- 대상: 폴더 / 파일 / 해시
- 결과 카드의 **오탐으로 등록**은 해당 파일의 해시를 "검사만" 규칙으로 추가합니다.

## 동작 확인 (EICAR 테스트)

실제 악성코드 대신 표준 테스트 문자열로 탐지 여부를 확인할 수 있습니다.

```bash
printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.com
```

검사 화면에 `/tmp/eicar.com`을 넣으면 **위험**(ClamAV `Win.Test.EICAR_HDB-1`)으로 판정되어야 합니다.

## 테스트

판정 규칙과 제외 목록 매칭은 Jest 단위 테스트로 검증합니다. 실제 엔진이나 악성코드 없이, 가짜 엔진 결과로 로직만 확인합니다.

```bash
npm test -w apps/api   # Jest
npm test -w apps/web   # Node 내장 테스트 (node --test)
```

- `verdict.spec.ts` — 위험·주의·의심 경계값(VT 2/3/4/5개), ClamAV 우선, 오류 판정
- `exclusion-matcher.spec.ts` — `/mods`가 `/mods-old`에 걸리지 않는지, 중첩 폴더 우선순위, 대소문자 무시, 해시 매칭
- `fs-errors.spec.ts`, `input-path.spec.ts` (API), `paths.test.mts`, `platform.test.mts` (웹) — Windows용으로 나눈 처리(파일 열기 오류, 따옴표 경로, `\` 경로 파일명, 화면 문구)가 macOS에서는 이전 코드와 똑같이 동작하는지 이전 구현과 직접 비교. OS는 인자로 넣으므로 어느 OS에서 돌려도 macOS·Windows 경우를 모두 검사

## 데이터 저장 위치

`~/Library/Application Support/LocalTotal/`

| 파일 | 내용 |
| --- | --- |
| `quarantine.json` | 격리 항목 |
| `quarantine/*.ltq` | 격리된 파일 |
| `exclusions.json` | 제외 목록 |
| `settings.json` | 설정 |

검사 결과, VT 캐시, VT 사용량은 서버 메모리에만 있으며 재시작하면 사라집니다. 앱을 완전히 지우려면 레포 폴더와 위 폴더를 삭제하면 됩니다.

## 보안

- API(`4000`), 웹(`3000`), clamd(`3310`) 모두 `127.0.0.1`에만 바인딩
- 상태를 바꾸는 요청에는 `X-LocalTotal: 1` 헤더 필수 (다른 사이트의 요청 위조 차단)
- `Host`·`Origin` 검사로 DNS 리바인딩 및 외부 출처 요청 차단
- VirusTotal에는 해시만 전송, 파일 업로드 코드 없음
- Windows Defender는 샘플 자동 제출이 켜져 있으면(`SubmitSamplesConsent` 1·3) 사용하지 않음
- 검사 파일은 읽기만 하고 실행하지 않음

## 프로젝트 구조

```text
LocalTotal/
├─ package.json          # npm workspaces, 실행 스크립트
├─ config/clamav/        # LocalTotal 전용 clamd·freshclam 설정 (macOS), windows/ (Windows)
├─ scripts/              # dev-clam-win.mjs — Windows용 clamd 실행 (npm run dev:clam:win)
└─ apps/
   ├─ api/               # NestJS — 엔진, 검사, 격리, 제외, 설정 (127.0.0.1:4000)
   └─ web/               # Next.js + Tailwind — 검사·격리함·설정 화면 (127.0.0.1:3000)
```

**기술 스택**: NestJS 12, Next.js 16 (App Router), Tailwind CSS v4, TypeScript, ClamAV, VirusTotal API v3

## 문제 해결

| 증상 | 해결 |
| --- | --- |
| ClamAV 배지가 계속 회색 | 첫 실행은 시그니처 다운로드로 오래 걸립니다. 터미널의 `clam` 로그를 확인하세요 |
| `EADDRINUSE` / 포트 사용 중 | 이전 프로세스가 남아 있습니다. `lsof -i :3310 -i :4000 -i :3000`으로 확인 후 종료 |
| 파일이 `EPERM` 오류 | 실행 앱에 전체 디스크 접근 권한을 주세요 |
| VirusTotal 배지 비활성 | `apps/api/.env`의 `VT_API_KEY` 확인 후 재시작 |
| Intel Mac에서 clamd 실패 | `config/clamav/*.conf`와 `package.json`의 `/opt/homebrew/var/lib/clamav`를 `/usr/local/var/lib/clamav`로 변경 |

## 로드맵

- [x] macOS: ClamAV + VirusTotal 해시 조회, 파일·폴더 검사, 격리·복원, 제외 목록, 설정
- [ ] Windows: ClamAV 실행(`npm run dev:win`) ✅, Windows 화면 문구·경로 처리 ✅, Microsoft Defender(`MpCmdRun`) 연동 ✅, Defender 제외 폴더 동작 확인

## 라이선스

[MIT](LICENSE) © 2026 yunsuper

- ClamAV는 별도로 설치한 프로그램(GPLv2)을 로컬 TCP로 호출하며, 이 레포에 ClamAV 코드는 포함되어 있지 않습니다.
- VirusTotal은 각자의 API 키로 호출하며 [VirusTotal 이용약관](https://docs.virustotal.com/docs/terms-of-service)을 따릅니다. 무료(Public) API 키는 비상업적 용도로 제한됩니다.
