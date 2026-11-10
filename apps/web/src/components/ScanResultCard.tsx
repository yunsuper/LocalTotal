"use client";

import { useState } from "react";
import { formatBytes, formatTime } from "@/lib/format";
import { fileName } from "@/lib/paths";
import {
    ENGINE_LABEL,
    ENGINE_VERDICT,
    EXCLUSION_KIND_LABEL,
    EXCLUSION_MODE_LABEL,
    FINAL_VERDICT,
} from "@/lib/labels";
import type { EngineResult, FileScanResult } from "@/lib/types";

const FLAGGED = new Set(["danger", "caution", "suspicious"]);

function EngineDetail({ r }: { r: EngineResult }) {
    const stats = r.detail?.stats;
    if (stats) {
        const total =
            stats.malicious +
            stats.suspicious +
            stats.undetected +
            stats.harmless;
        return (
            <span>
                {stats.malicious}/{total} 엔진 탐지
                {r.detail?.link && (
                    <a
                        href={r.detail.link}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                        VirusTotal에서 보기
                    </a>
                )}
            </span>
        );
    }
    return <span>{r.detail?.message ?? "—"}</span>;
}

interface Props {
    result: FileScanResult;
    quarantined?: boolean;
    falsePositive?: boolean;
    onQuarantine?: () => Promise<void>;
    onMarkFalsePositive?: () => Promise<void>;
}

export function ScanResultCard({
    result,
    quarantined = false,
    falsePositive = false,
    onQuarantine,
    onMarkFalsePositive,
}: Props) {
    const [stage, setStage] = useState<"idle" | "confirm" | "working">("idle");
    const [fpWorking, setFpWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const verdict = FINAL_VERDICT[result.verdict];
    const name = fileName(result.path);
    const flagged = FLAGGED.has(result.verdict);
    const rule = result.excluded;
    const isFalsePositive = falsePositive || Boolean(rule);

    const doQuarantine = async () => {
        if (!onQuarantine) return;
        setStage("working");
        setError(null);
        try {
            await onQuarantine();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStage("idle");
        }
    };

    const doMarkFalsePositive = async () => {
        if (!onMarkFalsePositive) return;
        setFpWorking(true);
        setError(null);
        try {
            await onMarkFalsePositive();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setFpWorking(false);
        }
    };

    const outlineButton =
        "rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

    return (
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="truncate font-semibold">{name}</h2>
                    <p
                        className="truncate font-mono text-xs text-zinc-500"
                        title={result.path}
                    >
                        {result.path}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {flagged && isFalsePositive && (
                        <span className="rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            오탐 의심
                        </span>
                    )}
                    <span
                        className={`rounded-full border px-3 py-1 text-sm font-bold ${verdict.className}`}
                    >
                        {verdict.label}
                    </span>
                </div>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-zinc-500">크기</dt>
                <dd>{formatBytes(result.size)}</dd>
                <dt className="text-zinc-500">SHA-256</dt>
                <dd className="break-all font-mono">{result.sha256 || "—"}</dd>
                <dt className="text-zinc-500">검사 시각</dt>
                <dd>{formatTime(result.scannedAt)}</dd>
            </dl>

            {rule && (
                <p className="mt-3 text-xs text-sky-700 dark:text-sky-300">
                    제외 목록: {EXCLUSION_KIND_LABEL[rule.kind]} 규칙 ·{" "}
                    {EXCLUSION_MODE_LABEL[rule.mode]}
                    {rule.note ? ` · ${rule.note}` : ""}
                </p>
            )}

            {result.results.length > 0 && (
                <table className="mt-4 w-full text-sm">
                    <thead>
                        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                            <th className="py-2 font-normal">엔진</th>
                            <th className="whitespace-nowrap py-2 font-normal">
                                결과
                            </th>
                            <th className="py-2 font-normal">상세</th>
                            <th className="py-2 text-right font-normal">
                                시간
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.results.map((r) => {
                            const v = ENGINE_VERDICT[r.verdict];
                            return (
                                <tr
                                    key={r.engine}
                                    className="border-b border-zinc-100 align-top dark:border-zinc-900"
                                >
                                    <td className="py-2 pr-3">
                                        {ENGINE_LABEL[r.engine]}
                                    </td>
                                    <td
                                        className={`py-2 pr-3 font-semibold ${v.className}`}
                                    >
                                        <span className="whitespace-nowrap">
                                            {v.label}
                                        </span>
                                        {r.threatName && (
                                            <div className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                                {r.threatName}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">
                                        <EngineDetail r={r} />
                                    </td>
                                    <td className="py-2 text-right text-zinc-500">
                                        {r.durationMs}ms
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                    외부 전송:{" "}
                    {result.externalSent === "sha256"
                        ? "SHA-256 해시만"
                        : "없음 (로컬 검사만)"}
                </p>

                {flagged &&
                    (quarantined ? (
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            격리됨 · 격리함에서 복원할 수 있어요
                        </span>
                    ) : isFalsePositive ? (
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            제외 목록에 등록됨 · 격리 대상에서 빠짐
                        </span>
                    ) : stage === "confirm" ? (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-zinc-600 dark:text-zinc-400">
                                격리함으로 옮길까요?
                            </span>
                            <button
                                type="button"
                                onClick={() => void doQuarantine()}
                                className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500"
                            >
                                격리
                            </button>
                            <button
                                type="button"
                                onClick={() => setStage("idle")}
                                className={outlineButton}
                            >
                                취소
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {onMarkFalsePositive && (
                                <button
                                    type="button"
                                    disabled={fpWorking || stage === "working"}
                                    onClick={() => void doMarkFalsePositive()}
                                    className={outlineButton}
                                >
                                    {fpWorking ? "등록 중…" : "오탐으로 등록"}
                                </button>
                            )}
                            {onQuarantine && (
                                <button
                                    type="button"
                                    disabled={stage === "working" || fpWorking}
                                    onClick={() => setStage("confirm")}
                                    className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                                >
                                    {stage === "working" ? "격리 중…" : "격리"}
                                </button>
                            )}
                        </div>
                    ))}
            </div>
            {error && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    {error}
                </p>
            )}
        </article>
    );
}
