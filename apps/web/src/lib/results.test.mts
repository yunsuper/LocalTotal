import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasLocalEngineError } from "./results.ts";
import type { EngineResult, FileScanResult } from "./types.ts";

const r = (
    engine: EngineResult["engine"],
    verdict: EngineResult["verdict"],
): EngineResult => ({ engine, verdict, durationMs: 0 });
const file = (results: EngineResult[]) =>
    ({ path: "/x", verdict: "clean", results }) as unknown as FileScanResult;

describe("macOS의 깨끗함은 카드로 올리지 않는다 (M7 이전과 같음)", () => {
    const cases: [string, EngineResult[]][] = [
        ["ClamAV 깨끗함", [r("clamav", "clean")]],
        ["+ VT 미등록", [r("clamav", "clean"), r("virustotal", "unknown")]],
        ["+ VT 깨끗함", [r("clamav", "clean"), r("virustotal", "clean")]],
        ["+ VT 오류", [r("clamav", "clean"), r("virustotal", "error")]],
    ];
    for (const [name, results] of cases) {
        it(name, () => assert.equal(hasLocalEngineError(file(results)), false));
    }
});

describe("Windows: 로컬 엔진 오류가 있으면 카드로", () => {
    it("ClamAV 오류 + Defender 깨끗함", () => {
        assert.equal(
            hasLocalEngineError(
                file([r("clamav", "error"), r("defender", "clean")]),
            ),
            true,
        );
    });
    it("ClamAV 깨끗함 + Defender 오류", () => {
        assert.equal(
            hasLocalEngineError(
                file([r("clamav", "clean"), r("defender", "error")]),
            ),
            true,
        );
    });
    it("둘 다 깨끗함", () => {
        assert.equal(
            hasLocalEngineError(
                file([r("clamav", "clean"), r("defender", "clean")]),
            ),
            false,
        );
    });
});
