import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * File storage for uploads. Only metadata and the storage key live in MySQL;
 * bytes live here. This local-disk driver suits a single server; an S3-compatible
 * driver can implement the same three methods later.
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  /** Null when the object does not exist. */
  abstract open(key: string): Promise<{ stream: ReadStream; size: number } | null>;
  abstract remove(key: string): Promise<void>;
}

/** Keys look like "<uuid>/<uuid>/<uuid>.webp"; nothing else is accepted. */
export const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly root: string;

  constructor(config: AppConfigService) {
    super();
    this.root = resolve(config.get('STORAGE_LOCAL_DIR'));
  }

  /** Maps a key to a path, refusing anything that could escape the storage root. */
  private pathFor(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Storage key escapes root: ${key}`);
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' }); // never overwrite
  }

  async open(key: string): Promise<{ stream: ReadStream; size: number } | null> {
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      return { stream: createReadStream(path), size: info.size };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.pathFor(key), { force: true });
    } catch (error: unknown) {
      // An orphaned file is harmless; a failed DB delete would not be.
      this.logger.warn(`Could not delete ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
