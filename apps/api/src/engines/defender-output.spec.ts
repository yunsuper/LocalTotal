import {
  defenderPolicy,
  parseMpCmdRunOutput,
  parseRegDword,
  parseRegString,
} from './defender-output';

// 실제 MpCmdRun 출력 (Defender 4.18.26100.4, 2026-11-10 측정. docs/작업일지.md)
const DIR = 'C:\\Users\\me\\scratch\\mp-test';
const CLEAN = `Scan starting...\r\nScan finished.\r\nScanning ${DIR}\\clean.txt found no threats.\r\n`;
const EICAR = `Scan starting...\r\nScan finished.\r\nScanning ${DIR}\\eicar.com found 1 threats.\r\n\r\n<===========================LIST OF DETECTED THREATS==========================>\r\n----------------------------- Threat information ------------------------------\r\nThreat                  : Virus:DOS/EICAR_Test_File\r\nResources               : 1 total\r\n    file                : ${DIR}\\eicar.com\r\n-------------------------------------------------------------------------------\r\n`;
const EICAR_KOREAN_PATH = `Scan starting...\r\nScan finished.\r\nScanning ${DIR}\\??? ??\\?? ??? ??.com found 1 threats.\r\n\r\n<===========================LIST OF DETECTED THREATS==========================>\r\n----------------------------- Threat information ------------------------------\r\nThreat                  : Virus:DOS/EICAR_Test_File\r\nResources               : 1 total\r\n    file                : ${DIR}\\??? ??\\?? ??? ??.com\r\n-------------------------------------------------------------------------------\r\n`;
const MISSING = `CmdTool: Failed with hr = 0x80070002. Check C:\\Users\\me\\AppData\\Local\\Temp\\MpCmdRun.log for more information\r\n`;

// 위협이 여러 개인 경우(측정 형식을 블록 단위로 반복)
const TWO_THREATS = `Scan starting...\r\nScan finished.\r\nScanning ${DIR}\\x.zip found 2 threats.\r\n\r\n<===========================LIST OF DETECTED THREATS==========================>\r\n----------------------------- Threat information ------------------------------\r\nThreat                  : Virus:DOS/EICAR_Test_File\r\nResources               : 1 total\r\n    file                : ${DIR}\\x.zip->a.com\r\n-------------------------------------------------------------------------------\r\n----------------------------- Threat information ------------------------------\r\nThreat                  : Trojan:Win32/Example\r\nResources               : 1 total\r\n    file                : ${DIR}\\x.zip->b.exe\r\n-------------------------------------------------------------------------------\r\n`;

describe('parseMpCmdRunOutput', () => {
  it('위협 없음 (종료 코드 0)', () => {
    expect(parseMpCmdRunOutput(CLEAN, 0)).toEqual({ verdict: 'clean' });
  });

  it('EICAR 탐지 (종료 코드 2)', () => {
    expect(parseMpCmdRunOutput(EICAR, 2)).toEqual({
      verdict: 'malicious',
      threatName: 'Virus:DOS/EICAR_Test_File',
    });
  });

  it('경로가 ?로 깨져도 위협 이름만 보고 탐지한다', () => {
    expect(parseMpCmdRunOutput(EICAR_KOREAN_PATH, 2)).toMatchObject({
      verdict: 'malicious',
      threatName: 'Virus:DOS/EICAR_Test_File',
    });
  });

  it('위협 여러 개는 모두 남긴다', () => {
    expect(parseMpCmdRunOutput(TWO_THREATS, 2)).toEqual({
      verdict: 'malicious',
      threatName: 'Virus:DOS/EICAR_Test_File, Trojan:Win32/Example',
      detail: {
        threats: ['Virus:DOS/EICAR_Test_File', 'Trojan:Win32/Example'],
      },
    });
  });

  it('종료 코드 2인 오류(없는 파일)를 탐지로 보지 않는다', () => {
    expect(parseMpCmdRunOutput(MISSING, 2)).toEqual({
      verdict: 'error',
      detail: {
        message: 'Defender 검사 실패: 파일을 찾을 수 없음 (hr 0x80070002)',
        hr: '0x80070002',
      },
    });
  });

  it('모르는 hr도 값을 남긴다', () => {
    const r = parseMpCmdRunOutput(
      'CmdTool: Failed with hr = 0x8050A001. Check log\r\n',
      2,
    );
    expect(r.verdict).toBe('error');
    expect(r.detail).toMatchObject({ hr: '0x8050a001' });
  });

  it('형식을 모르면 오류 (종료 코드만으로 판정하지 않음)', () => {
    expect(parseMpCmdRunOutput('', 0).verdict).toBe('error');
    expect(parseMpCmdRunOutput('', 2).verdict).toBe('error');
    expect(parseMpCmdRunOutput('something else', null).verdict).toBe('error');
  });

  it('found no threats인데 종료 코드가 0이 아니면 오류', () => {
    expect(parseMpCmdRunOutput(CLEAN, 2).verdict).toBe('error');
  });

  it('LF 줄바꿈도 처리한다', () => {
    expect(parseMpCmdRunOutput(EICAR.replace(/\r\n/g, '\n'), 2).verdict).toBe(
      'malicious',
    );
  });
});

describe('reg query 출력', () => {
  it('REG_DWORD', () => {
    expect(
      parseRegDword(
        '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows Defender\\Spynet\r\n    SubmitSamplesConsent    REG_DWORD    0x0\r\n\r\n',
      ),
    ).toBe(0);
    expect(
      parseRegDword('    SubmitSamplesConsent    REG_DWORD    0x3\r\n'),
    ).toBe(3);
    expect(
      parseRegDword(
        'ERROR: The system was unable to find the specified registry key or value.',
      ),
    ).toBeNull();
  });

  it('REG_SZ', () => {
    expect(
      parseRegString('    AVSignatureVersion    REG_SZ    1.463.210.0\r\n'),
    ).toBe('1.463.210.0');
    expect(parseRegString('')).toBeNull();
  });
});

describe('defenderPolicy (SubmitSamplesConsent)', () => {
  it('2(보내지 않음): 사용, 안내 없음', () => {
    expect(defenderPolicy(2)).toEqual({ enabled: true });
  });

  it('0(보내기 전에 확인): 사용 + 안내', () => {
    const p = defenderPolicy(0);
    expect(p.enabled).toBe(true);
    expect(p.notice?.level).toBe('info');
    expect(p.notice?.message).toContain(
      'Set-MpPreference -SubmitSamplesConsent 2',
    );
  });

  it.each([1, 3])('%i(자동 전송): 끄고 설정 방법 안내', (v) => {
    const p = defenderPolicy(v);
    expect(p.enabled).toBe(false);
    expect(p.notice?.level).toBe('warn');
    expect(p.notice?.message).toContain(`SubmitSamplesConsent=${v}`);
    expect(p.notice?.message).toContain('자동 샘플 제출');
  });

  it.each([null, 4, -1])('확인 불가(%p): 끈다', (v) => {
    const p = defenderPolicy(v);
    expect(p.enabled).toBe(false);
    expect(p.notice?.message).toContain('확인할 수 없습니다');
  });
});
