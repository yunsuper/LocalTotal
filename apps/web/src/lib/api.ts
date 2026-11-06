import type { EngineStatus, FileScanResult } from "./types";

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

export const scanFile = (path: string, useVirusTotal: boolean) =>
    request<FileScanResult>("/scans/file", {
        method: "POST",
        body: JSON.stringify({ path, useVirusTotal }),
    });
