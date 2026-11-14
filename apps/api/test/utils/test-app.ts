import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { SessionResponse } from '@brokerdesk/shared-types';
import { AppModule } from '../../src/app.module.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import type { AppEnv } from '../../src/config/env.validation.js';
import { MailService, type OutgoingMail } from '../../src/mail/mail.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

export const HAS_TEST_DB = process.env['HAS_TEST_DB'] === 'true';
export const CLIENT_HEADER = { 'X-BrokerDesk-Client': 'web' } as const;
export const PASSWORD = 'Sabarmati@2026';

/** Captures outgoing mail so tests can follow reset / invitation links. */
export class CapturingMailService {
  readonly sent: OutgoingMail[] = [];

  send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }
  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.send({ to, subject: 'reset', text: link });
  }
  sendInvitation(to: string, _agency: string, _inviter: string, link: string): Promise<void> {
    return this.send({ to, subject: 'invitation', text: link });
  }

  /** Waits for a mail to `to` (password reset is sent after the HTTP response). */
  async waitForLink(to: string, timeoutMs = 5000): Promise<string> {
    const started = Date.now();
    for (;;) {
      const mail = [...this.sent].reverse().find((m) => m.to === to);
      if (mail) return mail.text;
      if (Date.now() - started > timeoutMs) throw new Error(`No mail sent to ${to}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

class OverridingConfigService extends AppConfigService {
  constructor(
    config: ConfigService<AppEnv, true>,
    private readonly overrides: Partial<AppEnv>,
  ) {
    super(config);
  }
  override get<K extends keyof AppEnv>(key: K): AppEnv[K] {
    return key in this.overrides ? (this.overrides[key] as AppEnv[K]) : super.get(key);
  }
}

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly prisma: PrismaService;
  readonly mail: CapturingMailService;
  readonly http: () => ReturnType<typeof request>;
  close(): Promise<void>;
}

export async function createTestApp(configOverrides: Partial<AppEnv> = {}): Promise<TestApp> {
  const mail = new CapturingMailService();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail);
  if (Object.keys(configOverrides).length > 0) {
    builder = builder.overrideProvider(AppConfigService).useFactory({
      factory: (config: ConfigService<AppEnv, true>) => new OverridingConfigService(config, configOverrides),
      inject: [ConfigService],
    });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  setupApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    mail,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Unique, readable test email. */
export function uniqueEmail(label: string): string {
  return `${label}.${randomUUID().slice(0, 8)}@example.test`;
}

/** Extracts the raw refresh token from a Set-Cookie header. */
export function refreshCookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((c) => c.startsWith('bd_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0]!.slice('bd_rt='.length);
}

export function cookieHeader(refreshToken: string): string {
  return `bd_rt=${refreshToken}`;
}

export interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly session: SessionResponse;
  readonly refreshToken: string;
  readonly auth: { Authorization: string };
}

export async function registerUser(t: TestApp, opts: { label: string; agencyName?: string }): Promise<TestUser> {
  const email = uniqueEmail(opts.label);
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({ name: `Test ${opts.label}`, email, password: PASSWORD, agencyName: opts.agencyName })
    .expect(201);
  const session = res.body as SessionResponse;
  return {
    email,
    password: PASSWORD,
    session,
    refreshToken: refreshCookieFrom(res),
    auth: { Authorization: `Bearer ${session.accessToken}` },
  };
}

/** Lets an agency have up to `seats` users (test setup only). */
export async function setSeatLimit(t: TestApp, agencyId: string, seats: number | null): Promise<void> {
  await t.prisma.subscription.update({ where: { agencyId }, data: { userLimit: seats } });
}

/** Invites `invitee` into `inviter`'s current agency with `role` and accepts it. Returns the invitee's agency-scoped auth header. */
export async function addMember(
  t: TestApp,
  inviter: TestUser,
  invitee: TestUser,
  role: 'OWNER' | 'ADMIN' | 'AGENT',
): Promise<{ Authorization: string }> {
  const inv = await t
    .http()
    .post('/api/v1/agencies/current/invitations')
    .set(inviter.auth)
    .send({ email: invitee.email, role })
    .expect(201);
  const token = new URL((inv.body as { inviteUrl: string }).inviteUrl).searchParams.get('token')!;
  const accepted = await t
    .http()
    .post('/api/v1/invitations/accept')
    .set(invitee.auth)
    .send({ token })
    .expect(200);
  const switched = await t
    .http()
    .post('/api/v1/auth/switch-agency')
    .set(invitee.auth)
    .send({ agencyId: (accepted.body as { agencyId: string }).agencyId })
    .expect(200);
  return { Authorization: `Bearer ${(switched.body as SessionResponse).accessToken}` };
}
