import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';

export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Outgoing email.
 *
 * No email provider is integrated yet. Drivers:
 * - `log`  (development default): writes the message, including links, to the
 *   server log so password-reset and invitation flows can be completed locally.
 * - `none` (production default): drops the message and logs a warning without
 *   the content. A real provider (e.g. SES/SMTP) must be added before launch;
 *   until then, invitation links are also returned to the inviting admin.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: AppConfigService) {}

  async send(mail: OutgoingMail): Promise<void> {
    if (this.config.get('MAIL_DRIVER') === 'log') {
      this.logger.log(`[mail:log] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
    } else {
      this.logger.warn(`[mail:none] Email "${mail.subject}" was not sent: no mail provider configured`);
    }
    return Promise.resolve();
  }

  sendPasswordReset(to: string, link: string, ttlMinutes: number): Promise<void> {
    return this.send({
      to,
      subject: 'Reset your BrokerDesk password',
      text:
        `We received a request to reset your BrokerDesk password.\n\n` +
        `Open this link to choose a new password (valid for ${ttlMinutes} minutes):\n${link}\n\n` +
        `If you did not request this, you can ignore this email.`,
    });
  }

  sendInvitation(to: string, agencyName: string, inviterName: string, link: string): Promise<void> {
    return this.send({
      to,
      subject: `${inviterName} invited you to ${agencyName} on BrokerDesk`,
      text: `${inviterName} has invited you to join ${agencyName} on BrokerDesk.\n\nAccept the invitation:\n${link}`,
    });
  }
}
