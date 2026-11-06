import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { sha256File } from '../common/file-hash';
import { EnginesService } from '../engines/engines.service';
import { EngineResult } from '../engines/scan-engine.interface';
import {
  Exclusion,
  ExclusionMatcher,
  ExclusionRef,
  ExclusionsService,
  toRef,
} from '../exclusions/exclusions.service';
import { SettingsService } from '../settings/settings.service';
import { aggregateVerdict, FinalVerdict } from './verdict';

const MB = 1024 * 1024;

/** always: 항상 VT 조회 / if-detected: ClamAV 탐지 시에만 / never: 조회 안 함 */
export type VtPolicy = 'always' | 'if-detected' | 'never';

export interface ScanOptions {
  vtPolicy: VtPolicy;
  matcher: ExclusionMatcher;
  maxFileSize: number; // bytes
}

export interface FileScanResult {
  path: string;
  size: number;
  sha256: string;
  verdict: FinalVerdict;
  results: EngineResult[];
  externalSent: 'sha256' | 'none';
  scannedAt: string;
  excluded?: ExclusionRef;
}

export interface ResolvedTarget {
  path: string;
  kind: 'file' | 'directory';
}

@Injectable()
export class ScansService {
  constructor(
    private readonly engines: EnginesService,
    private readonly exclusions: ExclusionsService,
    private readonly settings: SettingsService,
  ) {}

  /** 단일 파일 검사 (POST /scans/file). useVirusTotal이 없으면 설정값을 따른다 */
  async scanFile(
    inputPath: string,
    useVirusTotal?: boolean,
  ): Promise<FileScanResult> {
    const target = await this.resolveTarget(inputPath);
    if (target.kind !== 'file') {
      throw new BadRequestException({
        code: 'NOT_A_FILE',
        message: '파일 경로가 아닙니다 (폴더는 폴더 검사를 사용하세요)',
      });
    }
    const settings = await this.settings.get();
    const vtOn =
      (useVirusTotal ?? settings.useVirusTotal) &&
      (await this.engines.virustotal.isAvailable());
    return this.scanResolvedFile(target.path, {
      vtPolicy: vtOn ? 'always' : 'never',
      matcher: await this.exclusions.matcher(),
      maxFileSize: settings.maxFileSizeMb * MB,
    });
  }

  /** 사용자가 입력한 경로를 실제 경로로 바꾸고 읽을 수 있는지 확인 */
  async resolveTarget(inputPath: string): Promise<ResolvedTarget> {
    if (!isAbsolute(inputPath)) {
      throw new BadRequestException({
        code: 'INVALID_PATH',
        message: '절대 경로를 입력해야 합니다',
      });
    }
    try {
      const real = await realpath(inputPath);
      const info = await stat(real);
      if (!info.isFile() && !info.isDirectory()) {
        throw new BadRequestException({
          code: 'INVALID_PATH',
          message: '파일이나 폴더가 아닙니다',
        });
      }
      await access(real, constants.R_OK);
      return { path: real, kind: info.isFile() ? 'file' : 'directory' };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: `경로를 찾을 수 없습니다: ${inputPath}`,
        });
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ForbiddenException({
          code: 'NO_PERMISSION',
          message: '읽기 권한이 없습니다 (VS Code 전체 디스크 접근 권한 확인)',
        });
      }
      throw err;
    }
  }

  /** 이미 확인된 절대 경로 1개를 검사. 파일 오류는 예외 대신 '오류' 결과로 돌려준다. */
  async scanResolvedFile(
    absPath: string,
    opts: ScanOptions,
  ): Promise<FileScanResult> {
    const pathRule = opts.matcher.byPath(absPath);
    if (pathRule?.mode === 'skip') {
      const size = await stat(absPath).then(
        (s) => s.size,
        () => 0,
      );
      return excludedResult(absPath, size, '', pathRule);
    }

    let size = 0;
    let sha256 = '';
    try {
      size = (await stat(absPath)).size;
      sha256 = await sha256File(absPath);
    } catch (err) {
      return {
        path: absPath,
        size,
        sha256,
        verdict: 'error',
        results: [
          {
            engine: 'clamav',
            verdict: 'error',
            detail: { message: describeFsError(err) },
            durationMs: 0,
          },
        ],
        externalSent: 'none',
        scannedAt: new Date().toISOString(),
      };
    }

    const rule = pathRule ?? opts.matcher.byHash(sha256);
    if (rule?.mode === 'skip')
      return excludedResult(absPath, size, sha256, rule);

    const clamTask: Promise<EngineResult> =
      size > opts.maxFileSize
        ? Promise.resolve({
            engine: 'clamav',
            verdict: 'error',
            detail: {
              message: `크기 초과 (${Math.round(size / MB)}MB > ${Math.round(opts.maxFileSize / MB)}MB)`,
            },
            durationMs: 0,
          })
        : this.engines.clamav.scanFile(absPath);

    let results: EngineResult[];
    if (opts.vtPolicy === 'always') {
      results = await Promise.all([
        clamTask,
        this.engines.virustotal.lookupHash(sha256),
      ]);
    } else {
      const clam = await clamTask;
      results =
        opts.vtPolicy === 'if-detected' && clam.verdict === 'malicious'
          ? [clam, await this.engines.virustotal.lookupHash(sha256)]
          : [clam];
    }

    return {
      path: absPath,
      size,
      sha256,
      verdict: aggregateVerdict(results),
      results,
      externalSent: results.some((r) => r.engine === 'virustotal')
        ? 'sha256'
        : 'none',
      scannedAt: new Date().toISOString(),
      ...(rule ? { excluded: toRef(rule) } : {}),
    };
  }
}

function excludedResult(
  path: string,
  size: number,
  sha256: string,
  rule: Exclusion,
): FileScanResult {
  return {
    path,
    size,
    sha256,
    verdict: 'excluded',
    results: [],
    externalSent: 'none',
    scannedAt: new Date().toISOString(),
    excluded: toRef(rule),
  };
}

function describeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return '파일이 사라짐';
  if (code === 'EACCES' || code === 'EPERM') return '읽기 권한 없음';
  return (err as Error).message;
}
