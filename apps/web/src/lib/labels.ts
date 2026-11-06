import type { EngineName, EngineVerdict, FinalVerdict } from "./types";

export const ENGINE_LABEL: Record<EngineName, string> = {
    clamav: "ClamAV",
    virustotal: "VirusTotal",
    defender: "Defender",
};

export const FINAL_VERDICT: Record<
    FinalVerdict,
    { label: string; className: string }
> = {
    danger: {
        label: "위험",
        className:
            "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
    },
    suspicious: {
        label: "의심",
        className:
            "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
    },
    clean: {
        label: "깨끗함",
        className:
            "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    error: {
        label: "오류",
        className:
            "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-500/40 dark:bg-zinc-500/15 dark:text-zinc-300",
    },
};

export const ENGINE_VERDICT: Record<
    EngineVerdict,
    { label: string; className: string }
> = {
    clean: {
        label: "깨끗함",
        className: "text-emerald-700 dark:text-emerald-300",
    },
    malicious: { label: "탐지", className: "text-red-700 dark:text-red-300" },
    suspicious: {
        label: "의심",
        className: "text-amber-700 dark:text-amber-300",
    },
    unknown: { label: "미등록", className: "text-zinc-500 dark:text-zinc-400" },
    error: { label: "오류", className: "text-zinc-500 dark:text-zinc-400" },
};
