import { join, resolve } from 'node:path';
import {
  ExclusionMatcher,
  toRef,
  type Exclusion,
  type ExclusionKind,
  type ExclusionMode,
} from './exclusions.service';

// 가짜 제외 규칙 — 파일을 읽거나 쓰지 않는다
let seq = 0;
const rule = (
  kind: ExclusionKind,
  value: string,
  mode: ExclusionMode = 'scan_only',
  note?: string,
): Exclusion => ({
  id: `rule-${++seq}`,
  kind,
  value,
  mode,
  ...(note ? { note } : {}),
  createdAt: new Date(0).toISOString(),
});

// OS와 상관없이 절대 경로를 만든다
const p = (...parts: string[]) => resolve(join('/', 'lt-test', ...parts));

const caseInsensitive =
  process.platform === 'darwin' || process.platform === 'win32';

describe('ExclusionMatcher', () => {
  describe('폴더 규칙', () => {
    const mods = rule('folder', p('mods'));
    const m = new ExclusionMatcher([mods]);

    it('폴더 자신에 걸린다', () => {
      expect(m.byPath(p('mods'))).toBe(mods);
    });

    it('하위 파일·하위 폴더에 걸린다', () => {
      expect(m.byPath(p('mods', 'a.esp'))).toBe(mods);
      expect(m.byPath(p('mods', 'sub', 'deep', 'b.dll'))).toBe(mods);
    });

    it('이름이 비슷한 형제 폴더(/mods-old)에는 걸리지 않는다', () => {
      expect(m.byPath(p('mods-old'))).toBeNull();
      expect(m.byPath(p('mods-old', 'a.esp'))).toBeNull();
      expect(m.byPath(p('modsX.txt'))).toBeNull();
    });

    it('상위 폴더에는 걸리지 않는다', () => {
      expect(m.byPath(p())).toBeNull();
    });

    it('끝에 구분자가 붙은 규칙도 같게 동작한다', () => {
      const withSep = rule('folder', p('games') + '/');
      const m2 = new ExclusionMatcher([withSep]);
      expect(m2.byPath(p('games', 'x.exe'))).toBe(withSep);
      expect(m2.byPath(p('games2'))).toBeNull();
    });

    it('중첩 규칙은 더 깊은(구체적인) 폴더가 먼저 맞는다', () => {
      const outer = rule('folder', p('mo2'), 'scan_only');
      const inner = rule('folder', p('mo2', 'overwrite'), 'skip');
      // 등록 순서와 상관없이 깊은 규칙 우선
      const m2 = new ExclusionMatcher([outer, inner]);
      expect(m2.byPath(p('mo2', 'overwrite', 'x.dll'))).toBe(inner);
      expect(m2.byPath(p('mo2', 'mods', 'y.dll'))).toBe(outer);
    });
  });

  describe('파일 규칙', () => {
    const one = rule('file', p('tools', 'patcher.exe'));
    const m = new ExclusionMatcher([one]);

    it('정확히 같은 파일에만 걸린다', () => {
      expect(m.byPath(p('tools', 'patcher.exe'))).toBe(one);
      expect(m.byPath(p('tools', 'patcher.exe.bak'))).toBeNull();
      expect(m.byPath(p('tools', 'other.exe'))).toBeNull();
    });

    it('파일 규칙이 폴더 규칙보다 먼저 맞는다', () => {
      const folder = rule('folder', p('tools'), 'skip');
      const m2 = new ExclusionMatcher([folder, one]);
      expect(m2.byPath(p('tools', 'patcher.exe'))).toBe(one);
      expect(m2.byPath(p('tools', 'x.exe'))).toBe(folder);
    });
  });

  (caseInsensitive ? describe : describe.skip)('대소문자 (macOS·Windows)', () => {
    it('경로 대소문자가 달라도 같은 경로로 본다', () => {
      const mods = rule('folder', p('Mods'));
      const m = new ExclusionMatcher([mods]);
      expect(m.byPath(p('mods', 'A.ESP'))).toBe(mods);
      expect(m.byPath(p('MODS'))).toBe(mods);
    });
  });

  describe('해시 규칙', () => {
    const hash = 'a'.repeat(64);
    const h = rule('hash', hash);
    const m = new ExclusionMatcher([h]);

    it('같은 해시에 걸린다 (대소문자 무시)', () => {
      expect(m.byHash(hash)).toBe(h);
      expect(m.byHash(hash.toUpperCase())).toBe(h);
    });

    it('다른 해시나 빈 값에는 걸리지 않는다', () => {
      expect(m.byHash('b'.repeat(64))).toBeNull();
      expect(m.byHash('')).toBeNull();
    });

    it('해시 규칙은 경로 검사에 영향을 주지 않는다', () => {
      expect(m.byPath(p('anything'))).toBeNull();
    });
  });

  describe('skipsDir (폴더 탐색 생략 여부)', () => {
    it('건너뛰기 폴더 규칙이면 true', () => {
      const m = new ExclusionMatcher([rule('folder', p('cache'), 'skip')]);
      expect(m.skipsDir(p('cache'))).toBe(true);
      expect(m.skipsDir(p('cache', 'sub'))).toBe(true);
    });

    it('검사만 폴더 규칙이면 false (들어가서 검사는 한다)', () => {
      const m = new ExclusionMatcher([rule('folder', p('mods'), 'scan_only')]);
      expect(m.skipsDir(p('mods'))).toBe(false);
    });

    it('규칙이 없으면 false', () => {
      expect(new ExclusionMatcher([]).skipsDir(p('mods'))).toBe(false);
    });
  });

  it('규칙이 하나도 없으면 아무것도 걸리지 않는다', () => {
    const m = new ExclusionMatcher([]);
    expect(m.byPath(p('x'))).toBeNull();
    expect(m.byHash('a'.repeat(64))).toBeNull();
  });
});

describe('toRef', () => {
  it('검사 결과에 붙일 요약만 남긴다 (value·createdAt 제외)', () => {
    const r = rule('hash', 'c'.repeat(64), 'scan_only', '오탐 등록: eicar.com');
    expect(toRef(r)).toEqual({
      id: r.id,
      kind: 'hash',
      mode: 'scan_only',
      note: '오탐 등록: eicar.com',
    });
  });

  it('메모가 없으면 note 키를 넣지 않는다', () => {
    const r = rule('folder', p('mods'));
    expect(toRef(r)).not.toHaveProperty('note');
  });
});
