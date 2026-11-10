// Windows 전용 clamd 실행 스크립트 (npm run dev:clam:win)
// macOS는 package.json의 dev:clam(sh)을 그대로 쓴다. 이 파일은 macOS에서 실행되지 않는다.
//
// 순서: ClamAV 찾기 → 3310 포트 확인 → freshclam 갱신(실패해도 계속) → clamd --foreground
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONF_DIR = join(ROOT, 'config', 'clamav', 'windows');
const CLAMD_HOST = '127.0.0.1';
const CLAMD_PORT = 3310;
const DB_DIR = join(
  process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
  'LocalTotal',
  'clamav',
  'db',
);

const log = (msg) => console.log(`[clam] ${msg}`);

if (process.platform !== 'win32') {
  log('Windows 전용 스크립트입니다. macOS는 npm run dev를 사용하세요.');
  process.exit(1);
}

/** apps/api/.env에서 CLAMAV_DIR 하나만 읽는다 (VT 키 등 다른 값은 가져오지 않음) */
function clamavDirFromDotEnv() {
  try {
    const env = parseEnv(readFileSync(join(ROOT, 'apps', 'api', '.env'), 'utf8'));
    return env.CLAMAV_DIR?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 순서: 환경 변수 → apps/api/.env → PATH → %ProgramFiles%\ClamAV */
function findClamavDir() {
  const configured = process.env.CLAMAV_DIR?.trim() || clamavDirFromDotEnv();
  if (configured) {
    if (existsSync(join(configured, 'clamd.exe'))) return configured;
    log(`CLAMAV_DIR(${configured})에 clamd.exe가 없습니다. 다른 위치를 찾습니다.`);
  }
  const where = spawnSync('where.exe', ['clamd.exe'], { encoding: 'utf8' });
  if (where.status === 0) {
    const first = where.stdout.split(/\r?\n/).find(Boolean);
    if (first) return dirname(first.trim());
  }
  const programFiles = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ClamAV');
  if (existsSync(join(programFiles, 'clamd.exe'))) return programFiles;
  return null;
}

/** 3310에 이미 누가 있는지: 'free' | 'clamd'(PING에 PONG) | 'other' */
function probePort() {
  return new Promise((done) => {
    const socket = createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    let data = '';
    socket.setTimeout(3000);
    socket.on('connect', () => socket.write('zPING\0'));
    socket.on('data', (c) => (data += c));
    socket.on('end', () => done(data.replace(/\0/g, '').trim() === 'PONG' ? 'clamd' : 'other'));
    socket.on('timeout', () => {
      socket.destroy();
      done('other');
    });
    socket.on('error', (err) => done(err.code === 'ECONNREFUSED' ? 'free' : 'other'));
  });
}

const clamavDir = findClamavDir();
if (!clamavDir) {
  log('ClamAV를 찾을 수 없습니다. 설치: winget install --id Cisco.ClamAV -e');
  log('다른 위치에 설치했다면 apps/api/.env에 CLAMAV_DIR=<설치 폴더>를 적어 주세요.');
  log('API와 웹은 계속 실행되며, ClamAV 배지는 회색으로 표시됩니다.');
  process.exit(1);
}

const port = await probePort();
if (port === 'clamd') {
  log(`${CLAMD_HOST}:${CLAMD_PORT}에서 이미 clamd가 실행 중입니다. 새로 띄우지 않고 그대로 사용합니다.`);
  log('Windows 서비스로 등록했다면 관리자 터미널에서 clamd.exe --uninstall-service로 해제할 수 있습니다.');
  process.exit(0);
}
if (port === 'other') {
  log(`${CLAMD_PORT} 포트를 다른 프로그램이 사용 중입니다. netstat -ano | findstr :${CLAMD_PORT}로 확인해 주세요.`);
  process.exit(1);
}

mkdirSync(DB_DIR, { recursive: true });
log(`ClamAV: ${clamavDir}`);
log(`시그니처 DB: ${DB_DIR}`);

const fresh = spawnSync(
  join(clamavDir, 'freshclam.exe'),
  [`--config-file=${join(CONF_DIR, 'freshclam.conf')}`, `--datadir=${DB_DIR}`, '--quiet'],
  { stdio: 'inherit' },
);
if (fresh.status !== 0) log('시그니처 갱신 실패: 기존 DB로 계속합니다');

const clamd = spawn(
  join(clamavDir, 'clamd.exe'),
  [`--config-file=${join(CONF_DIR, 'clamd.conf')}`, `--datadir=${DB_DIR}`, '--foreground'],
  { stdio: 'inherit' },
);

// 이 스크립트가 종료 신호를 받으면 clamd도 함께 끈다
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (clamd.exitCode === null) clamd.kill();
  });
}
clamd.on('error', (err) => {
  log(`clamd 실행 실패: ${err.message}`);
  process.exit(1);
});
clamd.on('exit', (code) => process.exit(code ?? 0));
