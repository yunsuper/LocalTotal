import type { EngineNotice, EngineResult } from './scan-engine.interface';

/**
 * MpCmdRun 출력 해석과 샘플 제출 정책 (순수 함수, defender-output.spec.ts).
 * 형식은 실측값 기준 (Defender 4.18.26100.4, docs/작업일지.md):
 * - 종료 코드 0 = 위협 없음, 2 = 위협 발견 "또는" 오류 → 종료 코드만으로 판정하지 않는다
 * - stdout은 ASCII뿐이고 경로의 비ASCII 문자는 ?로 깨진다 → 출력 속 경로는 보지 않는다
 */

type Parsed = Pick<EngineResult, 'verdict' | 'threatName' | 'detail'>;

// 잘 알려진 HRESULT
const HR_MESSAGES: Record<string, string> = {
  '0x80070002': '파일을 찾을 수 없음',
  '0x80070003': '경로를 찾을 수 없음',
  '0x80070005': '접근 거부',
  '0x80070020': '다른 프로그램이 파일을 사용 중',
  '0x800106ba': 'Defender 서비스가 실행 중이 아님',
};

export function parseMpCmdRunOutput(
  stdout: string,
  exitCode: number | null,
): Parsed {
  const text = stdout.replace(/\r\n?/g, '\n');

  const found = /found (\d+) threats\./.exec(text);
  const threats = [...text.matchAll(/^Threat\s*:\s*(.+?)\s*$/gm)].map(
    (m) => m[1],
  );
  if (found && Number(found[1]) > 0 && threats.length > 0) {
    return {
      verdict: 'malicious',
      threatName: threats.join(', '),
      ...(threats.length > 1 ? { detail: { threats } } : {}),
    };
  }

  if (/found no threats\./.test(text) && exitCode === 0) {
    return { verdict: 'clean' };
  }

  const hr = /Failed with hr = (0x[0-9a-f]+)/i.exec(text)?.[1].toLowerCase();
  if (hr) {
    const reason = HR_MESSAGES[hr];
    return {
      verdict: 'error',
      detail: {
        message: `Defender 검사 실패${reason ? `: ${reason}` : ''} (hr ${hr})`,
        hr,
      },
    };
  }
  return {
    verdict: 'error',
    detail: {
      message: `Defender 출력을 해석하지 못함 (종료 코드 ${exitCode ?? '없음'})`,
    },
  };
}

/** `reg query … /v 이름` 출력에서 REG_DWORD 값 */
export function parseRegDword(stdout: string): number | null {
  const m = /REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout);
  return m ? parseInt(m[1], 16) : null;
}

/** `reg query … /v 이름` 출력에서 REG_SZ 값 */
export function parseRegString(stdout: string): string | null {
  const m = /REG_SZ\s+(.+?)\s*$/im.exec(stdout);
  return m ? m[1] : null;
}

export interface DefenderPolicy {
  enabled: boolean;
  notice?: EngineNotice;
}

/**
 * SubmitSamplesConsent: 0 보내기 전에 확인, 1 안전한 샘플 자동 전송, 2 보내지 않음, 3 모두 자동 전송.
 * 파일 내용을 외부로 보내지 않는 원칙에 따라 0·2만 사용하고, 1·3·확인 불가는 끈다.
 */
export function defenderPolicy(consent: number | null): DefenderPolicy {
  if (consent === 2) return { enabled: true };
  if (consent === 0) {
    return {
      enabled: true,
      notice: {
        level: 'info',
        message:
          'Defender 샘플 제출이 "보내기 전에 확인"으로 설정되어 있습니다. 검사 중 Windows가 파일을 Microsoft에 보낼지 물으면 "보내지 않음"을 선택하세요. 항상 막으려면 관리자 PowerShell에서 Set-MpPreference -SubmitSamplesConsent 2 를 실행하세요.',
      },
    };
  }
  const reason =
    consent === 1 || consent === 3
      ? `Defender 자동 샘플 제출이 켜져 있어(SubmitSamplesConsent=${consent}) 검사한 파일이 Microsoft로 전송될 수 있습니다.`
      : 'Defender 샘플 제출 설정을 확인할 수 없습니다.';
  return {
    enabled: false,
    notice: {
      level: 'warn',
      message: `${reason} 파일 내용을 외부로 보내지 않기 위해 Defender 검사를 끕니다. Windows 보안 → 바이러스 및 위협 방지 → 설정 관리 → "자동 샘플 제출"을 끄거나, 관리자 PowerShell에서 Set-MpPreference -SubmitSamplesConsent 2 를 실행하세요. 바꾸면 1분 안에 Defender 검사가 켜집니다.`,
    },
  };
}
