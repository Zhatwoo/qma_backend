import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL') || 'QMA <onboarding@resend.dev>';
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  private ensureConfigured() {
    if (!this.resend) {
      throw new Error('RESEND_API_KEY is not configured');
    }
  }

  async send({ to, subject, html }: { to: string; subject: string; html: string }) {
    this.ensureConfigured();
    const { error } = await this.resend!.emails.send({
      from: this.fromEmail,
      to,
      subject,
      html,
    });
    if (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw new Error(error.message);
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    await this.send({
      to,
      subject: 'Reset your QMA password',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset for your QMA account.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
      `,
    });
  }

  async sendInviteEmail(to: string, inviteUrl: string, companyName: string, inviterName: string) {
    await this.send({
      to,
      subject: `You're invited to join ${companyName} on QMA`,
      html: `
        <h2>Team Invitation</h2>
        <p>${inviterName} invited you to join <strong>${companyName}</strong> on QMA.</p>
        <p><a href="${inviteUrl}">Create your account</a></p>
        <p>Click the link above to set up your account and join the team. This invitation expires in 7 days.</p>
      `,
    });
  }
}
