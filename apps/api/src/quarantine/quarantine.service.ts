import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { appDataDir, quarantineDir } from '../common/app-paths';
import { sha256File } from '../common/file-hash';
import { ScanJobsService } from '../scans/scan-jobs.service';
import type { FinalVerdict } from '../scans/verdict';
import { JsonFile } from '../store/json-file';

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

interface QuarantineFile {
  version: 1;
  entries: QuarantineEntry[];
}

const exists = (p: string) =>
  lstat(p).then(
    () => true,
    () => false,
  );

function mapFsError(err: unknown, fallback: string): Error {
  if (err instanceof HttpException) return err;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EBUSY') {
    return new ConflictException({
      code: 'FILE_BUSY',
      message: '다른 프로그램이 파일을 사용 중입니다',
    });
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new ForbiddenException({
      code: 'NO_PERMISSION',
      message: `${fallback} (권한 없음)`,
    });
  }
  return new Error(`${fallback}: ${(err as Error).message}`);
}

@Injectable()
export class QuarantineService {
  private readonly store = new JsonFile<QuarantineFile>(
    join(appDataDir(), 'quarantine.json'),
    () => ({ version: 1, entries: [] }),
  );

  constructor(private readonly jobs: ScanJobsService) {}

  async list(): Promise<QuarantineEntry[]> {
    const { entries } = await this.store.read();
    return [...entries].sort((a, b) =>
      b.quarantinedAt.localeCompare(a.quarantinedAt),
    );
  }

  /** 검사 결과에 있는 파일만 격리할 수 있다 (임의 경로는 받지 않음) */
  quarantine(scanId: string, path: string): Promise<QuarantineEntry> {
    const result = this.jobs.findResult(scanId, path);
    // TODO(M5): 제외 목록 대상이면 409 EXCLUDED

    return this.store.update(async (data) => {
      const original = result.path;
      const info = await lstat(original).catch(() => null);
      if (!info) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: '파일이 이미 이동되었거나 삭제되었습니다',
        });
      }
      if (!info.isFile()) {
        throw new ConflictException({
          code: 'NOT_A_FILE',
          message: '일반 파일만 격리할 수 있습니다',
        });
      }
      if ((await sha256File(original)) !== result.sha256) {
        throw new ConflictException({
          code: 'FILE_CHANGED',
          message: '검사 후 파일 내용이 바뀌었습니다. 다시 검사해 주세요',
        });
      }

      const dir = quarantineDir();
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const id = randomUUID();
      const storedName = `${id}.ltq`;
      const stored = join(dir, storedName);

      await copyFile(original, stored, constants.COPYFILE_EXCL);
      try {
        if ((await sha256File(stored)) !== result.sha256)
          throw new Error('격리 사본 해시 불일치');
        await chmod(stored, 0o400); // 읽기 전용, 실행 불가
        await unlink(original);
      } catch (err) {
        await chmod(stored, 0o600).catch(() => undefined);
        await unlink(stored).catch(() => undefined);
        throw mapFsError(err, '원본 파일을 지울 수 없어 격리를 취소했습니다');
      }

      const entry: QuarantineEntry = {
        id,
        originalPath: original,
        storedName,
        sha256: result.sha256,
        size: info.size,
        mode: info.mode & 0o7777,
        verdict: result.verdict,
        detections: result.results
          .filter(
            (r) => r.verdict === 'malicious' || r.verdict === 'suspicious',
          )
          .map((r) => ({ engine: r.engine, threatName: r.threatName })),
        quarantinedAt: new Date().toISOString(),
      };
      return {
        data: { ...data, entries: [...data.entries, entry] },
        result: entry,
      };
    });
  }

  restore(id: string): Promise<{ restoredPath: string }> {
    return this.store.update(async (data) => {
      const entry = this.findEntry(data, id);
      const stored = join(quarantineDir(), entry.storedName);
      const target = await this.freeTargetPath(entry.originalPath);

      let created = false;
      try {
        await mkdir(dirname(target), { recursive: true });
        await copyFile(stored, target, constants.COPYFILE_EXCL);
        created = true;
        await chmod(target, entry.mode || 0o644);
        await chmod(stored, 0o600).catch(() => undefined);
        await unlink(stored);
      } catch (err) {
        if (created) await unlink(target).catch(() => undefined);
        throw mapFsError(err, '복원에 실패했습니다');
      }

      return {
        data: { ...data, entries: data.entries.filter((e) => e.id !== id) },
        result: { restoredPath: target },
      };
    });
  }

  remove(id: string): Promise<{ removed: true }> {
    return this.store.update(async (data) => {
      const entry = this.findEntry(data, id);
      const stored = join(quarantineDir(), entry.storedName);
      await chmod(stored, 0o600).catch(() => undefined); // Windows 읽기 전용 속성 대비
      await unlink(stored).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT')
          throw mapFsError(err, '격리 파일을 삭제하지 못했습니다');
      });
      return {
        data: { ...data, entries: data.entries.filter((e) => e.id !== id) },
        result: { removed: true as const },
      };
    });
  }

  private findEntry(data: QuarantineFile, id: string): QuarantineEntry {
    const entry = data.entries.find((e) => e.id === id);
    if (!entry) {
      throw new NotFoundException({
        code: 'QUARANTINE_NOT_FOUND',
        message: '격리 항목을 찾을 수 없습니다',
      });
    }
    return entry;
  }

  /** 원래 자리에 파일이 있으면 "이름 (복원).확장자", "이름 (복원 2).확장자" … */
  private async freeTargetPath(original: string): Promise<string> {
    if (!(await exists(original))) return original;
    const dir = dirname(original);
    const ext = extname(original);
    const name = basename(original, ext);
    for (let i = 1; i <= 100; i++) {
      const candidate = join(
        dir,
        `${name} (복원${i === 1 ? '' : ` ${i}`})${ext}`,
      );
      if (!(await exists(candidate))) return candidate;
    }
    throw new ConflictException({
      code: 'TARGET_EXISTS',
      message: '복원할 이름을 정하지 못했습니다',
    });
  }
}
