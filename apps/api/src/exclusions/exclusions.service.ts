import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { appDataDir } from '../common/app-paths';
import { JsonFile } from '../store/json-file';

export type ExclusionKind = 'folder' | 'file' | 'hash';
export type ExclusionMode = 'scan_only' | 'skip';

export interface Exclusion {
  id: string;
  kind: ExclusionKind;
  value: string;
  mode: ExclusionMode;
  note?: string;
  createdAt: string;
}

/** 검사 결과에 붙이는 요약 */
export interface ExclusionRef {
  id: string;
  kind: ExclusionKind;
  mode: ExclusionMode;
  note?: string;
}

interface ExclusionFile {
  version: 1;
  entries: Exclusion[];
}

const KINDS: ExclusionKind[] = ['folder', 'file', 'hash'];
const MODES: ExclusionMode[] = ['scan_only', 'skip'];

// macOS(APFS 기본)와 Windows는 대소문자를 구분하지 않음
const caseInsensitive =
  process.platform === 'darwin' || process.platform === 'win32';
const normPath = (p: string) => {
  const r = resolve(p);
  return caseInsensitive ? r.toLowerCase() : r;
};
const withSep = (p: string) => (p.endsWith(sep) ? p : p + sep);

export const toRef = (e: Exclusion): ExclusionRef => ({
  id: e.id,
  kind: e.kind,
  mode: e.mode,
  ...(e.note ? { note: e.note } : {}),
});

/** 검사 작업 하나 동안 쓰는 규칙 스냅샷 */
export class ExclusionMatcher {
  private readonly files = new Map<string, Exclusion>();
  private readonly folders: { key: string; rule: Exclusion }[] = [];
  private readonly hashes = new Map<string, Exclusion>();

  constructor(entries: Exclusion[]) {
    for (const e of entries) {
      if (e.kind === 'file') this.files.set(normPath(e.value), e);
      else if (e.kind === 'folder')
        this.folders.push({ key: withSep(normPath(e.value)), rule: e });
      else this.hashes.set(e.value.toLowerCase(), e);
    }
    // 더 깊은(구체적인) 폴더 규칙이 먼저 맞도록
    this.folders.sort((a, b) => b.key.length - a.key.length);
  }

  byPath(p: string): Exclusion | null {
    const key = normPath(p);
    const file = this.files.get(key);
    if (file) return file;
    const keyWithSep = withSep(key);
    // "/mods"가 "/mods-old"에 걸리지 않도록 구분자까지 비교
    return this.folders.find((f) => keyWithSep.startsWith(f.key))?.rule ?? null;
  }

  byHash(sha256: string): Exclusion | null {
    return sha256 ? (this.hashes.get(sha256.toLowerCase()) ?? null) : null;
  }

  /** 이 폴더를 아예 들어가지 않아도 되는지 */
  skipsDir(dir: string): boolean {
    const rule = this.byPath(dir);
    return rule?.kind === 'folder' && rule.mode === 'skip';
  }
}

const bad = (message: string) =>
  new BadRequestException({ code: 'INVALID_EXCLUSION', message });

@Injectable()
export class ExclusionsService {
  private readonly store = new JsonFile<ExclusionFile>(
    join(appDataDir(), 'exclusions.json'),
    () => ({ version: 1, entries: [] }),
  );

  async list(): Promise<Exclusion[]> {
    const { entries } = await this.store.read();
    return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async matcher(): Promise<ExclusionMatcher> {
    return new ExclusionMatcher((await this.store.read()).entries);
  }

  /** 같은 종류·값이 이미 있으면 모드와 메모만 갱신한다 */
  async add(input: Record<string, unknown>): Promise<Exclusion> {
    const kind = input.kind as ExclusionKind;
    if (!KINDS.includes(kind))
      throw bad('kind는 folder, file, hash 중 하나여야 합니다');
    const mode = (input.mode ?? 'scan_only') as ExclusionMode;
    if (!MODES.includes(mode))
      throw bad('mode는 scan_only 또는 skip이어야 합니다');
    if (input.note !== undefined && typeof input.note !== 'string')
      throw bad('note는 문자열이어야 합니다');
    const note =
      typeof input.note === 'string' && input.note.trim()
        ? input.note.trim().slice(0, 200)
        : undefined;
    const value = await this.normalizeValue(kind, input.value);

    return this.store.update(async (data) => {
      const existing = data.entries.find(
        (e) => e.kind === kind && e.value === value,
      );
      if (existing) {
        const updated: Exclusion = {
          ...existing,
          mode,
          ...(note ? { note } : {}),
        };
        return {
          data: {
            ...data,
            entries: data.entries.map((e) =>
              e.id === existing.id ? updated : e,
            ),
          },
          result: updated,
        };
      }
      const entry: Exclusion = {
        id: randomUUID(),
        kind,
        value,
        mode,
        ...(note ? { note } : {}),
        createdAt: new Date().toISOString(),
      };
      return {
        data: { ...data, entries: [...data.entries, entry] },
        result: entry,
      };
    });
  }

  remove(id: string): Promise<{ removed: true }> {
    return this.store.update(async (data) => {
      if (!data.entries.some((e) => e.id === id)) {
        throw new NotFoundException({
          code: 'EXCLUSION_NOT_FOUND',
          message: '제외 항목을 찾을 수 없습니다',
        });
      }
      return {
        data: { ...data, entries: data.entries.filter((e) => e.id !== id) },
        result: { removed: true as const },
      };
    });
  }

  private async normalizeValue(
    kind: ExclusionKind,
    raw: unknown,
  ): Promise<string> {
    if (typeof raw !== 'string' || !raw.trim()) throw bad('값이 필요합니다');
    const value = raw.trim();

    if (kind === 'hash') {
      if (!/^[a-f0-9]{64}$/i.test(value))
        throw bad('SHA-256은 64자리 16진수여야 합니다');
      return value.toLowerCase();
    }

    if (!isAbsolute(value)) throw bad('절대 경로를 입력해야 합니다');
    try {
      const real = await realpath(value);
      const info = await stat(real);
      if (kind === 'folder' && !info.isDirectory())
        throw bad('폴더 경로가 아닙니다');
      if (kind === 'file' && !info.isFile()) throw bad('파일 경로가 아닙니다');
      return real;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return resolve(value); // 지금 없는 경로(외장 드라이브 등)도 등록 허용
    }
  }
}
