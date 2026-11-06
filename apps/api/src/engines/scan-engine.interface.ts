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

export interface ScanEngine {
  readonly name: EngineName;
  isAvailable(): Promise<boolean>;
  version(): Promise<string | null>;
  scanFile(absPath: string, sha256: string): Promise<EngineResult>;
}
