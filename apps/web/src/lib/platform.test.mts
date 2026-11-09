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
};

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
        for (const word of ["Mac", "Finder", "Command", "Option", "/Users/"]) {
            assert.ok(!all.includes(word), word);
        }
    });
});
