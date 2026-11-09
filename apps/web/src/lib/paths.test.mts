// node --test (Node 24 타입 제거 실행). 실제 파일은 건드리지 않는다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileName, isWindowsPath, lastSegment } from "./paths.ts";

// M7 이전 구현 (macOS 동작 기준). 수정하지 말 것
const legacyFileName = (p: string) => p.split("/").pop() ?? p;
const legacyLastSegment = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

const MAC_PATHS = [
    "/Users/me/Downloads/mod.zip",
    "/Users/me/Downloads/some-mod/",
    "/Users/me/back\\slash name.txt", // macOS 파일명에는 \가 들어갈 수 있다
    "/Users/me/C:\\odd",
    "/",
    "",
    "relative/name",
    "/Volumes/외장 디스크/게임 모드/파일 (복원).esp",
];

describe("macOS 경로: M7 이전과 같다", () => {
    for (const p of MAC_PATHS) {
        it(JSON.stringify(p), () => {
            assert.equal(isWindowsPath(p), false);
            assert.equal(fileName(p), legacyFileName(p));
            assert.equal(lastSegment(p), legacyLastSegment(p));
        });
    }
});

describe("Windows 경로", () => {
    it("드라이브 경로에서 파일명을 뽑는다", () => {
        assert.equal(fileName("C:\\Users\\me\\eicar.com"), "eicar.com");
        assert.equal(fileName("D:/Games/MO2/mod.esp"), "mod.esp");
        assert.equal(fileName("c:\\a/b\\파일 이름.txt"), "파일 이름.txt");
    });

    it("UNC 경로", () => {
        assert.equal(isWindowsPath("\\\\nas\\share\\x.zip"), true);
        assert.equal(fileName("\\\\nas\\share\\x.zip"), "x.zip");
    });

    it("폴더 경로 끝의 구분자는 lastSegment가 무시한다", () => {
        assert.equal(lastSegment("C:\\Games\\MO2\\"), "MO2");
        assert.equal(lastSegment("C:\\"), "C:");
        assert.equal(fileName("C:\\Games\\MO2\\"), "");
    });
});
