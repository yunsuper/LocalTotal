import {
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { concat, Observable, of, Subject } from 'rxjs';
import { EnginesService } from '../engines/engines.service';
import {
  FileScanResult,
  ResolvedTarget,
  ScansService,
  VtPolicy,
} from './scans.service';
import { FinalVerdict } from './verdict';

const CONCURRENCY = 4;
const VT_ALL_THRESHOLD = 30; // M5에서 settings.json으로 이동
const MAX_FILES = 20_000;
const MAX_JOBS = 20; // 메모리에 보관할 최근 작업 수

export type JobStatus = 'collecting' | 'running' | 'done' | 'cancelled';
export type VtMode = 'all' | 'detected-only' | 'off';

export interface ScanJobSummary {
  id: string;
  status: JobStatus;
  paths: string[];
  total: number;
  scanned: number;
  counts: Record<FinalVerdict, number>;
  vtMode: VtMode;
  skippedDirs: number;
  truncated: boolean;
  createdAt: string;
  finishedAt: string | null;
}

export interface ScanJobDetail extends ScanJobSummary {
  results: FileScanResult[];
}

interface ScanJob extends ScanJobDetail {
  cancelRequested: boolean;
  events$: Subject<MessageEvent>;
}

const emptyCounts = (): Record<FinalVerdict, number> => ({
  danger: 0,
  caution: 0,
  suspicious: 0,
  clean: 0,
  error: 0,
});

@Injectable()
export class ScanJobsService {
  private readonly logger = new Logger(ScanJobsService.name);
  private readonly jobs = new Map<string, ScanJob>();

  constructor(
    private readonly scans: ScansService,
    private readonly engines: EnginesService,
  ) {}

  async start(
    inputPaths: string[],
    useVirusTotal: boolean,
  ): Promise<{ scanId: string }> {
    // 잘못된 경로는 작업을 만들기 전에 바로 400/404로 돌려준다
    const targets = await Promise.all(
      inputPaths.map((p) => this.scans.resolveTarget(p)),
    );

    const job: ScanJob = {
      id: randomUUID(),
      status: 'collecting',
      paths: targets.map((t) => t.path),
      total: 0,
      scanned: 0,
      counts: emptyCounts(),
      vtMode: 'off',
      skippedDirs: 0,
      truncated: false,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      results: [],
      cancelRequested: false,
      events$: new Subject<MessageEvent>(),
    };
    this.jobs.set(job.id, job);
    this.prune();

    void this.execute(job, targets, useVirusTotal);
    return { scanId: job.id };
  }

  detail(id: string): ScanJobDetail {
    const job = this.getJob(id);
    return { ...this.summary(job), results: [...job.results] };
  }

  events(id: string): Observable<MessageEvent> {
    const job = this.getJob(id);
    const head = of<MessageEvent>({
      type: 'progress',
      data: this.summary(job),
    });
    if (job.status === 'done' || job.status === 'cancelled') {
      return concat(
        head,
        of<MessageEvent>({ type: 'done', data: this.summary(job) }),
      );
    }
    return concat(head, job.events$.asObservable());
  }

  cancel(id: string): ScanJobSummary {
    const job = this.getJob(id);
    if (job.status === 'collecting' || job.status === 'running')
      job.cancelRequested = true;
    return this.summary(job);
  }

  private async execute(
    job: ScanJob,
    targets: ResolvedTarget[],
    useVirusTotal: boolean,
  ) {
    try {
      const files = await this.collect(job, targets);
      job.total = files.length;

      const vtAvailable =
        useVirusTotal && (await this.engines.virustotal.isAvailable());
      job.vtMode = !vtAvailable
        ? 'off'
        : files.length <= VT_ALL_THRESHOLD
          ? 'all'
          : 'detected-only';
      const policy: VtPolicy =
        job.vtMode === 'all'
          ? 'always'
          : job.vtMode === 'detected-only'
            ? 'if-detected'
            : 'never';

      job.status = 'running';
      this.emitProgress(job);

      let next = 0;
      const worker = async () => {
        while (!job.cancelRequested) {
          const file = files.at(next++);
          if (file === undefined) return;
          const result = await this.scans.scanResolvedFile(file, policy);
          job.results.push(result);
          job.scanned++;
          job.counts[result.verdict]++;
          job.events$.next({ type: 'result', data: result });
          this.emitProgress(job);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } catch (err) {
      this.logger.error(
        `검사 작업 실패 (${job.id}): ${(err as Error).message}`,
      );
    } finally {
      job.status = job.cancelRequested ? 'cancelled' : 'done';
      job.finishedAt = new Date().toISOString();
      job.events$.next({ type: 'done', data: this.summary(job) });
      job.events$.complete();
    }
  }

  /** 하위 폴더까지 파일 목록 수집. 심볼릭 링크는 따라가지 않는다. */
  private async collect(
    job: ScanJob,
    targets: ResolvedTarget[],
  ): Promise<string[]> {
    const files = new Set<string>();

    for (const target of targets) {
      if (job.cancelRequested) break;
      if (target.kind === 'file') {
        files.add(target.path);
        continue;
      }

      const stack = [target.path];
      while (stack.length > 0 && !job.cancelRequested) {
        const dir = stack.pop() as string;
        const entries = await readdir(dir, { withFileTypes: true }).catch(
          () => null,
        );
        if (!entries) {
          job.skippedDirs++; // 권한 없는 폴더 등
          continue;
        }
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile()) {
            files.add(full);
            if (files.size >= MAX_FILES) {
              job.truncated = true;
              return [...files];
            }
          }
        }
      }
    }
    return [...files];
  }

  private emitProgress(job: ScanJob) {
    job.events$.next({ type: 'progress', data: this.summary(job) });
  }

  private summary(job: ScanJob): ScanJobSummary {
    return {
      id: job.id,
      status: job.status,
      paths: job.paths,
      total: job.total,
      scanned: job.scanned,
      counts: { ...job.counts },
      vtMode: job.vtMode,
      skippedDirs: job.skippedDirs,
      truncated: job.truncated,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }

  private getJob(id: string): ScanJob {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException({
        code: 'SCAN_NOT_FOUND',
        message:
          '검사 작업을 찾을 수 없습니다 (서버를 재시작하면 결과가 사라집니다)',
      });
    }
    return job;
  }

  /** 오래된 완료 작업부터 정리해서 최근 MAX_JOBS개만 남긴다 */
  private prune() {
    if (this.jobs.size <= MAX_JOBS) return;
    for (const [id, job] of this.jobs) {
      if (this.jobs.size <= MAX_JOBS) break;
      if (job.status === 'done' || job.status === 'cancelled')
        this.jobs.delete(id);
    }
  }
}
