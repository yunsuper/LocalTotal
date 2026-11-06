export type EngineName = "clamav" | "defender" | "virustotal";
export type EngineVerdict =
    "clean" | "malicious" | "suspicious" | "unknown" | "error";
export type FinalVerdict =
    "danger" | "caution" | "suspicious" | "clean" | "error" | "excluded";
export type JobStatus = "collecting" | "running" | "done" | "cancelled";
export type VtMode = "all" | "detected-only" | "off";
export type ExclusionKind = "folder" | "file" | "hash";
export type ExclusionMode = "scan_only" | "skip";

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

export interface ExclusionRef {
    id: string;
    kind: ExclusionKind;
    mode: ExclusionMode;
    note?: string;
}

export interface FileScanResult {
    path: string;
    size: number;
    sha256: string;
    verdict: FinalVerdict;
    results: EngineResult[];
    externalSent: "sha256" | "none";
    scannedAt: string;
    excluded?: ExclusionRef;
}

export interface ScanJobSummary {
    id: string;
    status: JobStatus;
    paths: string[];
    total: number;
    scanned: number;
    counts: Record<FinalVerdict, number>;
    vtMode: VtMode;
    skippedDirs: number;
    excludedDirs: number;
    excludedFiles: number;
    truncated: boolean;
    createdAt: string;
    finishedAt: string | null;
}

export interface ScanJobDetail extends ScanJobSummary {
    results: FileScanResult[];
}

export interface QuarantineEntry {
    id: string;
    originalPath: string;
    storedName: string;
    sha256: string;
    size: number;
    mode: number;
    verdict: FinalVerdict;
    detections: { engine: string; threatName?: string }[];
    quarantinedAt: string;
}

export interface Exclusion {
    id: string;
    kind: ExclusionKind;
    value: string;
    mode: ExclusionMode;
    note?: string;
    createdAt: string;
}

export interface AppSettings {
    useVirusTotal: boolean;
    vtAllThreshold: number;
    maxFileSizeMb: number;
}
