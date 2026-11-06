import type {
    EngineStatus,
    FileScanResult,
    ScanJobDetail,
    ScanJobSummary,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export class ApiError extends Error {
    constructor(
        message: string,
        readonly code?: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, {
            ...init,
            headers: { "Content-Type": "application/json", ...init?.headers },
            cache: "no-store",
        });
    } catch {
        throw new ApiError(
            "API 서버에 연결할 수 없습니다 (npm run dev 확인)",
            "API_UNREACHABLE",
        );
    }

    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
        const err = body as { message?: unknown; code?: unknown } | null;
        throw new ApiError(
            typeof err?.message === "string"
                ? err.message
                : `요청 실패 (HTTP ${res.status})`,
            typeof err?.code === "string" ? err.code : undefined,
        );
    }
    return body as T;
}

export const getEngines = () => request<EngineStatus[]>("/engines");

/** 단일 파일 즉시 검사 (현재 화면은 startScan을 사용) */
export const scanFile = (path: string, useVirusTotal: boolean) =>
    request<FileScanResult>("/scans/file", {
        method: "POST",
        body: JSON.stringify({ path, useVirusTotal }),
    });

/** 파일·폴더 검사 작업 시작 */
export const startScan = (paths: string[], useVirusTotal: boolean) =>
    request<{ scanId: string }>("/scans", {
        method: "POST",
        body: JSON.stringify({ paths, useVirusTotal }),
    });

export const getScan = (id: string) =>
    request<ScanJobDetail>(`/scans/${encodeURIComponent(id)}`);

export const cancelScan = (id: string) =>
    request<ScanJobSummary>(`/scans/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
    });

export const scanEventsUrl = (id: string) =>
    `${API_URL}/scans/${encodeURIComponent(id)}/events`;
