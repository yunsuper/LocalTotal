import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { createConnection, Socket } from 'node:net';
import { EngineResult, ScanEngine } from './scan-engine.interface';

const CHUNK_SIZE = 64 * 1024;
const TIMEOUT_MS = 60_000;

@Injectable()
export class ClamavEngine implements ScanEngine {
  readonly name = 'clamav' as const;
  private readonly host: string;
  private readonly port: number;

  constructor(config: ConfigService) {
    this.host = config.get<string>('CLAMD_HOST', '127.0.0.1');
    this.port = Number(config.get<string>('CLAMD_PORT', '3310'));
  }

  async isAvailable(): Promise<boolean> {
    try {
      return (await this.command('PING')) === 'PONG';
    } catch {
      return false;
    }
  }

  async version(): Promise<string | null> {
    try {
      return await this.command('VERSION');
    } catch {
      return null;
    }
  }

  async scanFile(absPath: string): Promise<EngineResult> {
    const started = Date.now();
    try {
      const reply = await this.instream(absPath);
      return {
        engine: this.name,
        ...this.parseReply(reply),
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return {
        engine: this.name,
        verdict: 'error',
        detail: { message: (err as Error).message },
        durationMs: Date.now() - started,
      };
    }
  }

  // 응답 예: "stream: OK" / "stream: Eicar-Test-Signature FOUND" / "INSTREAM size limit exceeded. ERROR"
  private parseReply(
    reply: string,
  ): Pick<EngineResult, 'verdict' | 'threatName' | 'detail'> {
    if (reply === 'stream: OK') return { verdict: 'clean' };
    const found = /^stream: (.+) FOUND$/.exec(reply);
    if (found) return { verdict: 'malicious', threatName: found[1] };
    return {
      verdict: 'error',
      detail: { message: reply || 'clamd 응답 없음' },
    };
  }

  private connect(): Socket {
    const socket = createConnection({ host: this.host, port: this.port });
    socket.setTimeout(TIMEOUT_MS);
    return socket;
  }

  private command(cmd: 'PING' | 'VERSION'): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = this.connect();
      let data = '';
      socket.on('connect', () => socket.write(`z${cmd}\0`));
      socket.on('data', (chunk) => (data += chunk.toString()));
      socket.on('end', () => resolve(data.replace(/\0/g, '').trim()));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('clamd 응답 시간 초과'));
      });
      socket.on('error', reject);
    });
  }

  // INSTREAM: [4바이트 길이(빅엔디안) + 데이터] 반복, 길이 0으로 종료
  private instream(absPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const file = createReadStream(absPath, { highWaterMark: CHUNK_SIZE });
      const socket = this.connect();
      let reply = '';
      let settled = false;

      const finish = (text: string) => {
        if (settled) return;
        settled = true;
        file.destroy();
        socket.destroy();
        resolve(text.replace(/\0/g, '').trim());
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        file.destroy();
        socket.destroy();
        reject(err);
      };

      file.on('error', fail);
      socket.on('data', (chunk) => (reply += chunk.toString()));
      socket.on('end', () => finish(reply));
      socket.on('timeout', () => fail(new Error('clamd 응답 시간 초과')));
      // 크기 초과 시 clamd가 먼저 응답하고 연결을 끊으므로, 받은 응답이 있으면 그걸 결과로 쓴다
      socket.on('error', (err) => (reply ? finish(reply) : fail(err)));

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        file.on('data', (chunk: Buffer | string) => {
          const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
          const size = Buffer.alloc(4);
          size.writeUInt32BE(buf.length, 0);
          if (!socket.write(Buffer.concat([size, buf]))) {
            file.pause();
            socket.once('drain', () => file.resume());
          }
        });
        file.on('end', () => socket.write(Buffer.alloc(4)));
      });
    });
  }
}
