import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAC_TEXTS, osTexts, WINDOWS_TEXTS } from "./platform.ts";

// M7 이전 화면에 하드코딩돼 있던 문구 (macOS 동작 기준). 수정하지 말 것
const LEGACY = {
    machine: "이 Mac", // AppHeader: "파일 내용은 이 Mac 밖으로 나가지 않습니다."
    copyApp: "Finder", // ScanForm: "Finder에서 파일이나 폴더를 선택한 뒤"
    copyKeys: "Option + Command + C",
    scanPlaceholder: "/Users/cherrymac/Downloads/some-mod",
    folderPlaceholder: "/Users/cherrymac/Games/MO2", // 설정 화면 제외 목록 입력
    localEngines: "ClamAV", // ScanForm·설정: "ClamAV가 탐지한 파일만 조회"
    vtDetectedOnlyLabel: "VirusTotal: ClamAV 탐지 파일만 조회 (기준 개수 초과)", // labels.ts VT_MODE_LABEL
    quarantineDir: "~/Library/Application Support/LocalTotal/quarantine", // 격리함 화면
    // 설정 화면 (JSX 두 줄이 공백 하나로 이어져 렌더링되던 문장)
    maxFileSizeHint:
        "이보다 큰 파일은 ClamAV 검사를 건너뛰어요. clamd 설정 한도가 200MB예요. (1~200)",
};

describe("VT_MODE_LABEL과 맥 문구가 같다", () => {
    it("detected-only", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync(new URL("./labels.ts", import.meta.url), "utf8"),
        );
        assert.ok(src.includes(`"detected-only": "${LEGACY.vtDetectedOnlyLabel}"`));
    });
});

describe("macOS 문구: M7 이전과 같다", () => {
    for (const platform of ["darwin", "linux", undefined, ""]) {
        it(String(platform), () => {
            assert.deepEqual(osTexts(platform), LEGACY);
        });
    }
    it("MAC_TEXTS", () => assert.deepEqual(MAC_TEXTS, LEGACY));
});

describe("Windows 문구", () => {
    it("win32에서만 쓴다", () => {
        assert.equal(osTexts("win32"), WINDOWS_TEXTS);
    });
    it("macOS 용어가 남아 있지 않다", () => {
        const all = Object.values(WINDOWS_TEXTS).join(" ");
        for (const word of ["Mac", "Finder", "Command", "Option", "/Users/", "~/Library"]) {
            assert.ok(!all.includes(word), word);
        }
    });
});
