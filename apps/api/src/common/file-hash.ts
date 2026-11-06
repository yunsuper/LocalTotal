import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** 파일을 스트림으로 읽어 SHA-256(hex)을 계산한다. 큰 파일도 메모리에 다 올리지 않는다. */
export function sha256File(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(absPath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}
