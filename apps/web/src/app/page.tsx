"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EngineBadges } from "@/components/EngineBadges";
import { ScanForm } from "@/components/ScanForm";
import { ScanJobPanel, type JobView } from "@/components/ScanJobPanel";
import {
    cancelScan,
    getEngines,
    getScan,
    quarantineFile,
    scanEventsUrl,
    startScan,
} from "@/lib/api";
import type { EngineStatus, FileScanResult, ScanJobSummary } from "@/lib/types";

const isRunning = (job: JobView) =>
    job.summary.status === "collecting" || job.summary.status === "running";

function placeholderSummary(id: string, path: string): ScanJobSummary {
    return {
        id,
        status: "collecting",
        paths: [path],
        total: 0,
        scanned: 0,
        counts: { danger: 0, caution: 0, suspicious: 0, clean: 0, error: 0 },
        vtMode: "off",
        skippedDirs: 0,
        truncated: false,
        createdAt: new Date().toISOString(),
        finishedAt: null,
    };
}

export default function Home() {
    const [engines, setEngines] = useState<EngineStatus[] | null>(null);
    const [engineError, setEngineError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [jobs, setJobs] = useState<JobView[]>([]);
    const sources = useRef(new Map<string, EventSource>());

    // 첫 진입 시 엔진 상태 조회: 상태 변경은 Promise 콜백 안에서만
    useEffect(() => {
        let cancelled = false;
        getEngines()
            .then((list) => {
                if (cancelled) return;
                setEngines(list);
                setEngineError(null);
            })
            .catch((e: Error) => {
                if (!cancelled) setEngineError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // 화면을 벗어나면 열린 SSE 연결 정리
    useEffect(() => {
        const map = sources.current;
        return () => {
            map.forEach((es) => es.close());
            map.clear();
        };
    }, []);

    // 새로고침 버튼용 (검사 후 VT 사용량 갱신에도 사용)
    const refreshEngines = useCallback(async () => {
        try {
            setEngines(await getEngines());
            setEngineError(null);
        } catch (e) {
            setEngineError((e as Error).message);
        }
    }, []);

    const patchJob = useCallback(
        (id: string, fn: (job: JobView) => JobView) => {
            setJobs((prev) =>
                prev.map((j) => (j.summary.id === id ? fn(j) : j)),
            );
        },
        [],
    );

    const watchJob = useCallback(
        (id: string) => {
            const es = new EventSource(scanEventsUrl(id));
            sources.current.set(id, es);

            es.addEventListener("progress", (e) => {
                const summary = JSON.parse(
                    (e as MessageEvent<string>).data,
                ) as ScanJobSummary;
                patchJob(id, (j) => ({ ...j, summary }));
            });

            es.addEventListener("result", (e) => {
                const result = JSON.parse(
                    (e as MessageEvent<string>).data,
                ) as FileScanResult;
                patchJob(id, (j) => ({
                    ...j,
                    results: [...j.results, result],
                }));
            });

            es.addEventListener("done", () => {
                es.close();
                sources.current.delete(id);
                // 최종 결과는 서버 기준으로 다시 받아 정확히 맞춘다
                getScan(id)
                    .then(({ results, ...summary }) =>
                        patchJob(id, (j) => ({ ...j, summary, results })),
                    )
                    .catch((err: Error) =>
                        patchJob(id, (j) => ({ ...j, error: err.message })),
                    );
                void refreshEngines();
            });

            es.onerror = () => {
                if (es.readyState === EventSource.CLOSED) {
                    sources.current.delete(id);
                    patchJob(id, (j) => ({
                        ...j,
                        error: "진행 상황 연결이 끊겼어요 (API 서버 확인)",
                    }));
                }
            };
        },
        [patchJob, refreshEngines],
    );

    const handleScan = async (path: string, useVirusTotal: boolean) => {
        setStarting(true);
        setScanError(null);
        try {
            const { scanId } = await startScan([path], useVirusTotal);
            setJobs((prev) => [
                {
                    summary: placeholderSummary(scanId, path),
                    results: [],
                    error: null,
                    quarantined: [],
                },
                ...prev,
            ]);
            watchJob(scanId);
        } catch (e) {
            setScanError((e as Error).message);
        } finally {
            setStarting(false);
        }
    };

    const handleCancel = (id: string) => {
        cancelScan(id)
            .then((summary) => patchJob(id, (j) => ({ ...j, summary })))
            .catch((err: Error) =>
                patchJob(id, (j) => ({ ...j, error: err.message })),
            );
    };

    // 실패하면 예외가 카드까지 올라가서 카드에 에러가 표시된다
    const handleQuarantine = async (jobId: string, path: string) => {
        await quarantineFile(jobId, path);
        patchJob(jobId, (j) => ({
            ...j,
            quarantined: [...j.quarantined, path],
        }));
    };

    const vtAvailable =
        engines?.find((e) => e.name === "virustotal")?.available ?? false;
    const busy = starting || jobs.some(isRunning);

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <AppHeader />

            <section className="mb-6 flex items-center justify-between gap-4">
                <EngineBadges engines={engines} error={engineError} />
                <button
                    type="button"
                    onClick={() => void refreshEngines()}
                    className="shrink-0 rounded-md border border-zinc-200 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                    새로고침
                </button>
            </section>

            <ScanForm
                scanning={busy}
                vtAvailable={vtAvailable}
                onScan={handleScan}
            />

            {scanError && (
                <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {scanError}
                </p>
            )}

            <section className="mt-8 space-y-6">
                {jobs.map((job) => (
                    <ScanJobPanel
                        key={job.summary.id}
                        job={job}
                        onCancel={handleCancel}
                        onQuarantine={handleQuarantine}
                    />
                ))}
            </section>
        </main>
    );
}
