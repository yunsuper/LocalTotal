"use client";

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useOsTexts } from "@/components/PlatformProvider";
import { deleteQuarantine, listQuarantine, restoreQuarantine } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { ENGINE_LABEL, FINAL_VERDICT } from "@/lib/labels";
import { fileName } from "@/lib/paths";
import type { QuarantineEntry } from "@/lib/types";

function QuarantineRow({
    entry,
    onRestore,
    onDelete,
}: {
    entry: QuarantineEntry;
    onRestore: () => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const [stage, setStage] = useState<"idle" | "confirm-delete" | "working">(
        "idle",
    );
    const [error, setError] = useState<string | null>(null);
    const verdict = FINAL_VERDICT[entry.verdict];
    const name = fileName(entry.originalPath);

    const run = async (fn: () => Promise<void>) => {
        setStage("working");
        setError(null);
        try {
            await fn();
        } catch (e) {
            setError((e as Error).message);
            setStage("idle");
        }
    };

    return (
        <li className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="truncate font-semibold">{name}</p>
                    <p
                        className="truncate font-mono text-xs text-zinc-500"
                        title={entry.originalPath}
                    >
                        {entry.originalPath}
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${verdict.className}`}
                >
                    {verdict.label}
                </span>
            </div>

            <ul className="mt-2 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {entry.detections.map((d, i) => (
                    <li key={`${d.engine}-${i}`}>
                        {ENGINE_LABEL[d.engine as keyof typeof ENGINE_LABEL] ??
                            d.engine}
                        {d.threatName ? `: ${d.threatName}` : ""}
                    </li>
                ))}
                <li className="text-zinc-500">
                    {formatBytes(entry.size)} · 격리{" "}
                    {formatDateTime(entry.quarantinedAt)}
                </li>
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {stage === "confirm-delete" ? (
                    <>
                        <span className="text-red-700 dark:text-red-300">
                            영구 삭제하면 되돌릴 수 없어요.
                        </span>
                        <button
                            type="button"
                            onClick={() => void run(onDelete)}
                            className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500"
                        >
                            삭제
                        </button>
                        <button
                            type="button"
                            onClick={() => setStage("idle")}
                            className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                            취소
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={stage === "working"}
                            onClick={() => void run(onRestore)}
                            className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                            {stage === "working" ? "처리 중…" : "복원"}
                        </button>
                        <button
                            type="button"
                            disabled={stage === "working"}
                            onClick={() => setStage("confirm-delete")}
                            className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                            영구 삭제
                        </button>
                    </>
                )}
            </div>
            {error && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    {error}
                </p>
            )}
        </li>
    );
}

export default function QuarantinePage() {
    const [entries, setEntries] = useState<QuarantineEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const os = useOsTexts();

    useEffect(() => {
        let cancelled = false;
        listQuarantine()
            .then((list) => {
                if (!cancelled) setEntries(list);
            })
            .catch((e: Error) => {
                if (!cancelled) setError(e.message);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const reload = useCallback(async () => {
        try {
            setEntries(await listQuarantine());
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    const handleRestore = async (id: string) => {
        const { restoredPath } = await restoreQuarantine(id);
        setNotice(`복원했어요: ${restoredPath}`);
        await reload();
    };

    const handleDelete = async (id: string) => {
        await deleteQuarantine(id);
        setNotice("격리 파일을 영구 삭제했어요.");
        await reload();
    };

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <AppHeader />

            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
                격리된 파일은 실행되지 않도록 이름을 바꾸고 읽기 전용으로
                보관합니다. 보관 위치:{" "}
                <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
                    {os.quarantineDir}
                </code>
            </p>

            {notice && (
                <p className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {notice}
                </p>
            )}
            {error && (
                <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </p>
            )}

            {entries === null ? (
                <p className="text-sm text-zinc-500">불러오는 중…</p>
            ) : entries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
                    격리된 파일이 없어요.
                </p>
            ) : (
                <ul className="space-y-3">
                    {entries.map((entry) => (
                        <QuarantineRow
                            key={entry.id}
                            entry={entry}
                            onRestore={() => handleRestore(entry.id)}
                            onDelete={() => handleDelete(entry.id)}
                        />
                    ))}
                </ul>
            )}
        </main>
    );
}
