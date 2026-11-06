import { ScanResultCard } from "@/components/ScanResultCard";
import {
    JOB_STATUS_LABEL,
    FINAL_VERDICT,
    VERDICT_ORDER,
    VT_MODE_LABEL,
} from "@/lib/labels";
import type { FileScanResult, ScanJobSummary } from "@/lib/types";

export interface JobView {
    summary: ScanJobSummary;
    results: FileScanResult[];
    error: string | null;
}

interface Props {
    job: JobView;
    onCancel: (id: string) => void;
}

const baseName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function ScanJobPanel({ job, onCancel }: Props) {
    const { summary, results, error } = job;
    const running =
        summary.status === "collecting" || summary.status === "running";
    const percent =
        summary.total > 0
            ? Math.round((summary.scanned / summary.total) * 100)
            : 0;

    const sorted = [...results].sort(
        (a, b) =>
            VERDICT_ORDER.indexOf(a.verdict) -
                VERDICT_ORDER.indexOf(b.verdict) ||
            a.path.localeCompare(b.path),
    );
    const flagged = sorted.filter((r) => r.verdict !== "clean");
    const clean = sorted.filter((r) => r.verdict === "clean");
    const isSingleFile =
        summary.status === "done" &&
        summary.total === 1 &&
        results.length === 1;

    return (
        <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="truncate font-semibold">
                        {summary.paths.map(baseName).join(", ")}
                    </h2>
                    <p
                        className="truncate font-mono text-xs text-zinc-500"
                        title={summary.paths.join("\n")}
                    >
                        {summary.paths.join(", ")}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm text-zinc-500">
                        {JOB_STATUS_LABEL[summary.status]}
                    </span>
                    {running && (
                        <button
                            type="button"
                            onClick={() => onCancel(summary.id)}
                            className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                            취소
                        </button>
                    )}
                </div>
            </div>

            {/* 진행률 */}
            <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                        className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 dark:bg-zinc-100"
                        style={{
                            width: `${summary.status === "done" ? 100 : percent}%`,
                        }}
                    />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                    {summary.status === "collecting"
                        ? "파일 목록을 모으는 중…"
                        : `${summary.scanned} / ${summary.total} 파일 (${percent}%)`}
                </p>
            </div>

            {/* 판정별 개수 */}
            <div className="mt-3 flex flex-wrap gap-2">
                {VERDICT_ORDER.filter((v) => summary.counts[v] > 0).map((v) => (
                    <span
                        key={v}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${FINAL_VERDICT[v].className}`}
                    >
                        {FINAL_VERDICT[v].label} {summary.counts[v]}
                    </span>
                ))}
            </div>

            {/* 부가 정보 */}
            <ul className="mt-3 space-y-0.5 text-xs text-zinc-500">
                {summary.status !== "collecting" && (
                    <li>{VT_MODE_LABEL[summary.vtMode]}</li>
                )}
                {summary.skippedDirs > 0 && (
                    <li>
                        읽을 수 없는 폴더 {summary.skippedDirs}개를
                        건너뛰었어요.
                    </li>
                )}
                {summary.truncated && (
                    <li>파일이 2만 개를 넘어 일부만 검사했어요.</li>
                )}
            </ul>

            {error && (
                <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </p>
            )}

            {/* 결과 */}
            <div className="mt-4 space-y-4">
                {isSingleFile ? (
                    <ScanResultCard result={results[0]} />
                ) : (
                    <>
                        {flagged.map((r) => (
                            <ScanResultCard key={r.path} result={r} />
                        ))}
                        {clean.length > 0 && (
                            <details className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                                <summary className="cursor-pointer text-sm">
                                    깨끗한 파일 {clean.length}개
                                </summary>
                                <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs text-zinc-500">
                                    {clean.map((r) => (
                                        <li
                                            key={r.path}
                                            className="truncate"
                                            title={r.path}
                                        >
                                            {r.path}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
