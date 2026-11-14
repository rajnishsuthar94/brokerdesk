import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Argon2id password hashing with OWASP-recommended minimum parameters
 * (m = 19 MiB, t = 2, p = 1). Parameters and salt are encoded in the hash, so
 * they can be raised later: `needsRehash` upgrades old hashes on next login.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Used to spend equal time when the email doesn't exist (prevents user enumeration). */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('timing-equaliser-not-a-real-password', ARGON2_OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /** Never throws for malformed hashes; returns false instead. */
  async verify(hash: string | null, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? this.dummyHash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }
}
