import { activeEngines } from './engines.service';

const e = { clamav: 'clamav', defender: 'defender', virustotal: 'virustotal' };

describe('activeEngines', () => {
  it.each(['darwin', 'linux'] as const)(
    '%s: M7 이전과 같은 목록(ClamAV, VirusTotal)',
    (platform) => {
      expect(activeEngines(platform, e)).toEqual(['clamav', 'virustotal']);
    },
  );

  it('win32: Defender 추가', () => {
    expect(activeEngines('win32', e)).toEqual([
      'clamav',
      'defender',
      'virustotal',
    ]);
  });
});
