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
}

export const MAC_TEXTS: OsTexts = {
    machine: "이 Mac",
    copyApp: "Finder",
    copyKeys: "Option + Command + C",
    scanPlaceholder: "/Users/cherrymac/Downloads/some-mod",
    folderPlaceholder: "/Users/cherrymac/Games/MO2",
};

export const WINDOWS_TEXTS: OsTexts = {
    machine: "이 PC",
    copyApp: "파일 탐색기",
    copyKeys: "Ctrl + Shift + C",
    scanPlaceholder: "C:\\Users\\me\\Downloads\\some-mod",
    folderPlaceholder: "D:\\Games\\MO2",
};

export function osTexts(platform: string | undefined): OsTexts {
    return platform === "win32" ? WINDOWS_TEXTS : MAC_TEXTS;
}
