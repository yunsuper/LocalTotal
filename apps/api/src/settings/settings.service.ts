import { BadRequestException, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { appDataDir } from '../common/app-paths';
import { JsonFile } from '../store/json-file';

export interface AppSettings {
  useVirusTotal: boolean; // 검사 화면의 VT 체크박스 기본값
  vtAllThreshold: number; // 이 개수 이하면 모든 파일 VT 조회
  maxFileSizeMb: number; // 이보다 큰 파일은 ClamAV 검사 생략
}

export const MAX_FILE_SIZE_LIMIT_MB = 200; // clamd.conf StreamMaxLength와 맞춤

export const DEFAULT_SETTINGS: AppSettings = {
  useVirusTotal: true,
  vtAllThreshold: 30,
  maxFileSizeMb: 200,
};

const bad = (message: string) =>
  new BadRequestException({ code: 'INVALID_SETTINGS', message });

function intIn(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw bad(`${label}은(는) ${min}~${max} 사이의 정수여야 합니다`);
  }
  return value;
}

@Injectable()
export class SettingsService {
  private readonly store = new JsonFile<Partial<AppSettings>>(
    join(appDataDir(), 'settings.json'),
    () => ({}),
  );

  async get(): Promise<AppSettings> {
    return { ...DEFAULT_SETTINGS, ...(await this.store.read()) };
  }

  update(patch: Record<string, unknown>): Promise<AppSettings> {
    const clean: Partial<AppSettings> = {};
    if ('useVirusTotal' in patch) {
      if (typeof patch.useVirusTotal !== 'boolean')
        throw bad('useVirusTotal은 true/false여야 합니다');
      clean.useVirusTotal = patch.useVirusTotal;
    }
    if ('vtAllThreshold' in patch) {
      clean.vtAllThreshold = intIn(
        patch.vtAllThreshold,
        0,
        500,
        'VT 전체 조회 기준',
      );
    }
    if ('maxFileSizeMb' in patch) {
      clean.maxFileSizeMb = intIn(
        patch.maxFileSizeMb,
        1,
        MAX_FILE_SIZE_LIMIT_MB,
        '최대 파일 크기(MB)',
      );
    }

    return this.store.update(async (data) => {
      const next: AppSettings = { ...DEFAULT_SETTINGS, ...data, ...clean };
      return { data: next, result: next };
    });
  }
}
