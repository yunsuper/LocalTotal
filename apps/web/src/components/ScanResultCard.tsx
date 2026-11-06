import { formatBytes, formatTime } from "@/lib/format";
import { ENGINE_LABEL, ENGINE_VERDICT, FINAL_VERDICT } from "@/lib/labels";
import type { EngineResult, FileScanResult } from "@/lib/types";

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

export function ScanResultCard({ result }: { result: FileScanResult }) {
    const verdict = FINAL_VERDICT[result.verdict];
    const fileName = result.path.split("/").pop() ?? result.path;

    return (
        <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="truncate font-semibold">{fileName}</h2>
                    <p
                        className="truncate font-mono text-xs text-zinc-500"
                        title={result.path}
                    >
                        {result.path}
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-sm font-bold ${verdict.className}`}
                >
                    {verdict.label}
                </span>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-zinc-500">크기</dt>
                <dd>{formatBytes(result.size)}</dd>
                <dt className="text-zinc-500">SHA-256</dt>
                <dd className="break-all font-mono">{result.sha256}</dd>
                <dt className="text-zinc-500">검사 시각</dt>
                <dd>{formatTime(result.scannedAt)}</dd>
            </dl>

            <table className="mt-4 w-full text-sm">
                <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                        <th className="py-2 font-normal">엔진</th>
                        <th className="py-2 font-normal">결과</th>
                        <th className="py-2 font-normal">상세</th>
                        <th className="py-2 text-right font-normal">시간</th>
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
                                    {v.label}
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

            <p className="mt-3 text-xs text-zinc-500">
                외부 전송:{" "}
                {result.externalSent === "sha256"
                    ? "SHA-256 해시만"
                    : "없음 (로컬 검사만)"}
            </p>
        </article>
    );
}
