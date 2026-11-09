import { normalizeInputPath } from './input-path';

// M7 이전에는 컨트롤러·제외 목록에서 trim()만 했다
const legacy = (raw: string) => raw.trim();

const INPUTS = [
  '/Users/me/Downloads/mod.zip',
  '  /Users/me/Downloads/mod.zip  ',
  '"/Users/me/Downloads/mod.zip"', // macOS에서는 따옴표를 벗기지 않는다 (기존처럼 절대 경로 아님 → 400)
  "'/Users/me/a b'",
  '/Users/me/"quoted" name',
  '"',
  '""',
  'C:\\Users\\me\\file.exe',
  '"C:\\Users\\me\\file.exe"',
];

describe.each(['darwin', 'linux'] as const)(
  '%s: M7 이전과 같다 (trim만)',
  (platform) => {
    it.each(INPUTS)('%j', (raw) => {
      expect(normalizeInputPath(raw, platform)).toBe(legacy(raw));
    });
  },
);

describe('win32', () => {
  it('탐색기 "경로로 복사"의 큰따옴표를 벗긴다', () => {
    expect(normalizeInputPath('"C:\\Users\\me\\a b\\file.exe"', 'win32')).toBe(
      'C:\\Users\\me\\a b\\file.exe',
    );
  });

  it('앞뒤 공백과 따옴표를 함께 정리한다', () => {
    expect(normalizeInputPath('  "D:\\Games\\MO2"  \r\n', 'win32')).toBe(
      'D:\\Games\\MO2',
    );
    expect(normalizeInputPath('" D:\\Games "', 'win32')).toBe('D:\\Games');
  });

  it('따옴표가 없으면 trim만 한다', () => {
    expect(normalizeInputPath('  C:\\x\\y.txt ', 'win32')).toBe('C:\\x\\y.txt');
  });

  it('한쪽에만 있거나 작은따옴표면 건드리지 않는다', () => {
    expect(normalizeInputPath('"C:\\x', 'win32')).toBe('"C:\\x');
    expect(normalizeInputPath("'C:\\x'", 'win32')).toBe("'C:\\x'");
  });

  it('빈 따옴표는 빈 문자열이 된다 (이후 절대 경로 검사에서 400)', () => {
    expect(normalizeInputPath('""', 'win32')).toBe('');
  });
});
