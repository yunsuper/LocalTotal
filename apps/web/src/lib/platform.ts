// OS별 화면 문구. 서버(Next.js)가 도는 OS = 검사 대상 파일이 있는 OS (모두 127.0.0.1).
// win32가 아니면 M7 이전 macOS 문구를 그대로 쓴다 (platform.test.ts).

export interface OsTexts {
    /** "파일 내용은 ○○ 밖으로 나가지 않습니다" */
    machine: string;
    /** 경로를 복사하는 앱 */
    copyApp: string;
    /** 경로 복사 단축키 */
    copyKeys: string;
    scanPlaceholder: string;
    folderPlaceholder: string;
    /** 로컬 검사 엔진 ("○○가 탐지한 파일만 조회") */
    localEngines: string;
    /** 작업 패널의 VT 모드 표시 (탐지 파일만) */
    vtDetectedOnlyLabel: string;
    /** 격리함 화면의 보관 위치 */
    quarantineDir: string;
    /** 설정 화면 최대 파일 크기 설명 */
    maxFileSizeHint: string;
}

export const MAC_TEXTS: OsTexts = {
    machine: "이 Mac",
    copyApp: "Finder",
    copyKeys: "Option + Command + C",
    scanPlaceholder: "/Users/cherrymac/Downloads/some-mod",
    folderPlaceholder: "/Users/cherrymac/Games/MO2",
    localEngines: "ClamAV",
    vtDetectedOnlyLabel: "VirusTotal: ClamAV 탐지 파일만 조회 (기준 개수 초과)",
    quarantineDir: "~/Library/Application Support/LocalTotal/quarantine",
    maxFileSizeHint:
        "이보다 큰 파일은 ClamAV 검사를 건너뛰어요. clamd 설정 한도가 200MB예요. (1~200)",
};

export const WINDOWS_TEXTS: OsTexts = {
    machine: "이 PC",
    copyApp: "파일 탐색기",
    copyKeys: "Ctrl + Shift + C",
    scanPlaceholder: "C:\\Users\\me\\Downloads\\some-mod",
    folderPlaceholder: "D:\\Games\\MO2",
    localEngines: "ClamAV·Defender",
    vtDetectedOnlyLabel:
        "VirusTotal: ClamAV·Defender 탐지 파일만 조회 (기준 개수 초과)",
    quarantineDir: "%APPDATA%\\LocalTotal\\quarantine",
    maxFileSizeHint:
        "이보다 큰 파일은 ClamAV 검사를 건너뛰어요(clamd 설정 한도 200MB). Defender는 크기와 관계없이 검사해요. (1~200)",
};

export function osTexts(platform: string | undefined): OsTexts {
    return platform === "win32" ? WINDOWS_TEXTS : MAC_TEXTS;
}
