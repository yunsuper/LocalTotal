import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  defenderPolicy,
  DefenderPolicy,
  parseMpCmdRunOutput,
  parseRegDword,
  parseRegString,
} from './defender-output';
import {
  EngineNotice,
  EngineResult,
  ScanEngine,
} from './scan-engine.interface';

const SCAN_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 10_000;
const POLICY_TTL_MS = 60_000; // /engines는 5초마다 불리므로 설정 조회는 1분 캐시

const DEFENDER_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender';
const POLICY_KEY = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender';

interface RunResult {
  stdout: string;
  exitCode: number | null;
  error?: Error;
}

/** 셸 없이 실행한다 (경로를 명령 문자열로 잇지 않음) */
function run(
  file: string,
  args: string[],
  timeout: number,
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout, encoding: 'utf8' },
      (err, stdout) => {
        const code = (err as NodeJS.ErrnoException | null)?.code;
        resolve({
          stdout: stdout ?? '',
          exitCode: !err ? 0 : typeof code === 'number' ? code : null,
          // 종료 코드가 0이 아닌 것은 정상 응답일 수 있으므로(MpCmdRun 2), 실행 자체 실패만 오류로 본다
          error: err && typeof code !== 'number' ? err : undefined,
        });
      },
    );
  });
}

/**
 * Microsoft Defender (Windows 전용). MpCmdRun으로 파일 1개를 검사하고 결과만 받는다.
 * -DisableRemediation: Defender가 파일을 지우거나 격리하지 않는다(격리는 사용자가 LocalTotal에서).
 */
@Injectable()
export class DefenderEngine implements ScanEngine {
  readonly name = 'defender' as const;
  private readonly mpCmdRun = join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Windows Defender',
    'MpCmdRun.exe',
  );
  private policyCache: { at: number; value: DefenderPolicy } | null = null;
  private versionCache: { at: number; value: string | null } | null = null;

  async isAvailable(): Promise<boolean> {
    return (await this.policy()).enabled;
  }

  async notice(): Promise<EngineNotice | undefined> {
    return (await this.policy()).notice;
  }

  async version(): Promise<string | null> {
    if (this.versionCache && Date.now() - this.versionCache.at < POLICY_TTL_MS)
      return this.versionCache.value;
    const sig = parseRegString(
      (
        await this.reg(
          `${DEFENDER_KEY}\\Signature Updates`,
          'AVSignatureVersion',
        )
      ).stdout,
    );
    const value = sig
      ? `Microsoft Defender (시그니처 ${sig})`
      : 'Microsoft Defender';
    this.versionCache = { at: Date.now(), value };
    return value;
  }

  async scanFile(absPath: string): Promise<EngineResult> {
    const started = Date.now();
    const r = await run(
      this.mpCmdRun,
      ['-Scan', '-ScanType', '3', '-File', absPath, '-DisableRemediation'],
      SCAN_TIMEOUT_MS,
    );
    const parsed = r.error
      ? {
          verdict: 'error' as const,
          detail: { message: `Defender 실행 실패: ${r.error.message}` },
        }
      : parseMpCmdRunOutput(r.stdout, r.exitCode);
    return { engine: this.name, ...parsed, durationMs: Date.now() - started };
  }

  /** 샘플 제출 설정에 따른 사용 여부 (1분 캐시) */
  private async policy(): Promise<DefenderPolicy> {
    if (process.platform !== 'win32') return { enabled: false };
    if (this.policyCache && Date.now() - this.policyCache.at < POLICY_TTL_MS)
      return this.policyCache.value;

    let value: DefenderPolicy;
    if (!existsSync(this.mpCmdRun)) {
      value = {
        enabled: false,
        notice: {
          level: 'warn',
          message: `MpCmdRun.exe를 찾을 수 없어 Defender 검사를 끕니다 (${this.mpCmdRun})`,
        },
      };
    } else {
      value = defenderPolicy(await this.submitSamplesConsent());
    }
    this.policyCache = { at: Date.now(), value };
    return value;
  }

  /** 그룹 정책 → Defender 설정 → Get-MpPreference 순서로 읽는다 */
  private async submitSamplesConsent(): Promise<number | null> {
    for (const key of [`${POLICY_KEY}\\Spynet`, `${DEFENDER_KEY}\\Spynet`]) {
      const v = parseRegDword(
        (await this.reg(key, 'SubmitSamplesConsent')).stdout,
      );
      if (v !== null) return v;
    }
    const ps = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-MpPreference).SubmitSamplesConsent',
      ],
      QUERY_TIMEOUT_MS,
    );
    const n = Number(ps.stdout.trim());
    return ps.stdout.trim() !== '' && Number.isInteger(n) ? n : null;
  }

  private reg(key: string, value: string): Promise<RunResult> {
    return run('reg.exe', ['query', key, '/v', value], QUERY_TIMEOUT_MS);
  }
}
