import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 작은 JSON 파일 저장소.
 * - 쓰기는 임시 파일 → rename 으로 교체해서, 쓰는 도중 꺼져도 파일이 깨지지 않는다.
 * - update()는 읽기-수정-쓰기를 한 줄로 세워 동시 수정 충돌을 막는다.
 */
export class JsonFile<T> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly fallback: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        return this.fallback();
      throw err;
    }
  }

  /** fn이 예외를 던지면 파일은 바뀌지 않는다 */
  update<R>(fn: (data: T) => Promise<{ data: T; result: R }>): Promise<R> {
    const run = this.queue.then(async () => {
      const current = await this.read();
      const { data, result } = await fn(current);
      await this.write(data);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(data: T) {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tmp, this.filePath);
  }
}
