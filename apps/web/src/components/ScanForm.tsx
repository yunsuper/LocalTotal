"use client";

import { FormEvent, useState } from "react";
import { useOsTexts } from "./PlatformProvider";

interface Props {
    scanning: boolean;
    vtAvailable: boolean;
    defaultUseVirusTotal: boolean;
    vtAllThreshold: number;
    onScan: (path: string, useVirusTotal: boolean) => Promise<void>;
}

export function ScanForm({
    scanning,
    vtAvailable,
    defaultUseVirusTotal,
    vtAllThreshold,
    onScan,
}: Props) {
    const [path, setPath] = useState("");
    const [useVirusTotal, setUseVirusTotal] = useState(defaultUseVirusTotal);
    const os = useOsTexts();

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = path.trim();
        if (!trimmed || scanning) return;
        void onScan(trimmed, useVirusTotal && vtAvailable);
    };

    return (
        <form
            onSubmit={submit}
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
            <label htmlFor="path" className="mb-2 block text-sm font-medium">
                검사할 파일 또는 폴더 경로
            </label>
            <div className="flex gap-2">
                <input
                    id="path"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder={os.scanPlaceholder}
                    spellCheck={false}
                    className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                    type="submit"
                    disabled={scanning || !path.trim()}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                    {scanning ? "검사 중…" : "검사"}
                </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
                {os.copyApp}에서 파일이나 폴더를 선택한 뒤{" "}
                <kbd className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                    {os.copyKeys}
                </kbd>
                로 경로를 복사해 붙여넣으세요. 폴더는 하위 폴더까지 검사합니다.
            </p>

            <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={useVirusTotal && vtAvailable}
                    disabled={!vtAvailable}
                    onChange={(e) => setUseVirusTotal(e.target.checked)}
                    className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                />
                VirusTotal 해시 조회
                <span className="text-zinc-500">
                    {vtAvailable
                        ? "(파일 내용은 전송하지 않음)"
                        : "(API 키 없음)"}
                </span>
            </label>
            {vtAvailable && (
                <p className="mt-1 pl-6 text-xs text-zinc-500">
                    파일 {vtAllThreshold}개 이하는 모두 조회하고, 그보다 많으면{" "}
                    {os.localEngines}가 탐지한 파일만 조회합니다. 새 파일은 조회 간격
                    제한으로 1개당 약 15초가 걸려요.
                </p>
            )}
        </form>
    );
}
