import { homedir } from 'node:os';
import { join } from 'node:path';

/** 앱 데이터 폴더 (격리 파일, JSON 저장소) */
export function appDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'LocalTotal');
  }
  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'LocalTotal',
    );
  }
  return join(homedir(), '.local', 'share', 'LocalTotal');
}

export const quarantineDir = () => join(appDataDir(), 'quarantine');
