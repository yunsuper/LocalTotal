export type EngineName = "clamav" | "defender" | "virustotal";
export type EngineVerdict =
    "clean" | "malicious" | "suspicious" | "unknown" | "error";
export type FinalVerdict =
    "danger" | "caution" | "suspicious" | "clean" | "error";

export interface EngineStatus {
    name: EngineName;
    available: boolean;
    version: string | null;
    usage?: { today: number; limit: number };
}

export interface VtStats {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
    [key: string]: number;
}

export interface EngineResult {
    engine: EngineName;
    verdict: EngineVerdict;
    threatName?: string;
    detail?: {
        message?: string;
        stats?: VtStats;
        link?: string;
        cached?: boolean;
    };
    durationMs: number;
}

export interface FileScanResult {
    path: string;
    size: number;
    sha256: string;
    verdict: FinalVerdict;
    results: EngineResult[];
    externalSent: "sha256" | "none";
    scannedAt: string;
}
