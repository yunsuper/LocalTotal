"use client";

import { useCallback, useEffect, useState } from "react";
import { EngineBadges } from "@/components/EngineBadges";
import { ScanForm } from "@/components/ScanForm";
import { ScanResultCard } from "@/components/ScanResultCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getEngines, scanFile } from "@/lib/api";
import type { EngineStatus, FileScanResult } from "@/lib/types";

export default function Home() {
    const [engines, setEngines] = useState<EngineStatus[] | null>(null);
    const [engineError, setEngineError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [results, setResults] = useState<FileScanResult[]>([]);

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

    // 새로고침 버튼용
    const refreshEngines = useCallback(async () => {
        try {
            setEngines(await getEngines());
            setEngineError(null);
        } catch (e) {
            setEngineError((e as Error).message);
        }
    }, []);

    const handleScan = async (path: string, useVirusTotal: boolean) => {
        setScanning(true);
        setScanError(null);
        try {
            const result = await scanFile(path, useVirusTotal);
            setResults((prev) => [result, ...prev]);
        } catch (e) {
            setScanError((e as Error).message);
        } finally {
            setScanning(false);
        }
    };

    const vtAvailable =
        engines?.find((e) => e.name === "virustotal")?.available ?? false;

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        LocalTotal
                    </h1>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        파일 내용은 이 Mac 밖으로 나가지 않습니다.
                        VirusTotal에는 SHA-256 해시만 조회합니다.
                    </p>
                </div>
                <ThemeToggle />
            </header>

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
                scanning={scanning}
                vtAvailable={vtAvailable}
                onScan={handleScan}
            />

            {scanError && (
                <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {scanError}
                </p>
            )}

            <section className="mt-8 space-y-4">
                {results.map((r) => (
                    <ScanResultCard
                        key={`${r.sha256}-${r.scannedAt}`}
                        result={r}
                    />
                ))}
            </section>
        </main>
    );
}
