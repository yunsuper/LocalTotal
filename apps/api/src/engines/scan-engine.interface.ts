export type EngineName = 'clamav' | 'defender' | 'virustotal';
export type EngineVerdict =
  'clean' | 'malicious' | 'suspicious' | 'unknown' | 'error';

export interface EngineResult {
  engine: EngineName;
  verdict: EngineVerdict;
  threatName?: string;
  detail?: Record<string, unknown>;
  durationMs: number;
}

/** 엔진 배지 아래에 띄우는 안내 (예: Defender 샘플 제출 설정) */
export interface EngineNotice {
  level: 'info' | 'warn';
  message: string;
}

export interface ScanEngine {
  readonly name: EngineName;
  isAvailable(): Promise<boolean>;
  version(): Promise<string | null>;
  notice?(): Promise<EngineNotice | undefined>;
  scanFile(absPath: string, sha256: string): Promise<EngineResult>;
}
