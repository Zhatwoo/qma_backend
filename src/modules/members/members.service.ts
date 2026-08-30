import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { randomBytes } from 'crypto';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { EventsService } from '../events/events.service';

export class InviteMemberDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() roleId: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() status?: string;
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private events: EventsService,
    private config: ConfigService,
  ) {}

  async findAll(user: AuthUser) {
    return this.prisma.companyMember.findMany({
      where: { companyId: user.companyId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true, status: true } },
        role: true,
      },
    });
  }

  async invite(user: AuthUser, dto: InviteMemberDto) {
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, companyId: user.companyId },
    });
    if (!role) throw new NotFoundException('Role not found');

    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId: user.companyId,
        user: { email: dto.email },
        status: 'ACTIVE',
      },
    });
    if (existingMember) throw new ConflictException('User is already a member of this company');

    const existing = await this.prisma.invitation.findFirst({
      where: { email: dto.email, companyId: user.companyId, status: 'PENDING' },
    });

    const inviter = await this.prisma.user.findUnique({ where: { id: user.sub } });
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    let invitation;
    let token: string;

    if (existing) {
      token = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      invitation = await this.prisma.invitation.update({
        where: { id: existing.id },
        data: {
          roleId: dto.roleId,
          token,
          invitedById: user.sub,
          expiresAt,
        },
      });
    } else {
      token = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      invitation = await this.prisma.invitation.create({
        data: {
          email: dto.email,
          companyId: user.companyId,
          roleId: dto.roleId,
          token,
          invitedById: user.sub,
          expiresAt,
        },
      });
    }

    const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;
    let emailSent = false;
    try {
      await this.mail.sendInviteEmail(
        dto.email,
        inviteUrl,
        company?.name || 'your team',
        inviter ? `${inviter.firstName} ${inviter.lastName}` : 'A teammate',
      );
      emailSent = true;
    } catch (err) {
      this.logger.warn(
        `Invite email to ${dto.email} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      await this.events.notify(
        existingUser.id,
        'INVITATION',
        'Team invitation',
        `You've been invited to join ${company?.name || 'a team'} on QMA`,
        { entityType: 'invitation', entityId: invitation.id },
      );
    }

    await this.events.logAudit(user.companyId, user.sub, 'INVITE', 'member', dto.email, null, { roleId: dto.roleId });

    return {
      invitation,
      emailSent,
      inviteUrl: emailSent ? undefined : inviteUrl,
      resent: !!existing,
    };
  }

  async getInvitationPreview(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { company: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    const role = await this.prisma.role.findUnique({ where: { id: invitation.roleId } });
    const expired = invitation.expiresAt < new Date();
    const valid = invitation.status === 'PENDING' && !expired;
    const existingUser = await this.prisma.user.findUnique({ where: { email: invitation.email } });

    return {
      email: invitation.email,
      companyName: invitation.company.name,
      companyCode: invitation.company.slug,
      roleName: role?.name || 'Team member',
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      expired,
      valid,
      hasAccount: !!existingUser,
    };
  }

  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired invitation');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user!.email !== invitation.email) {
      throw new ConflictException('Email does not match invitation');
    }

    const existingMember = await this.prisma.companyMember.findFirst({
      where: { userId, companyId: invitation.companyId, status: 'ACTIVE' },
    });
    if (existingMember) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });
      return { message: 'Already a member of this company' };
    }

    await this.prisma.$transaction([
      this.prisma.companyMember.create({
        data: { userId, companyId: invitation.companyId, roleId: invitation.roleId },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      }),
    ]);

    return { message: 'Invitation accepted' };
  }

  async updateMember(user: AuthUser, memberId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId: user.companyId },
      include: { role: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    const updated = await this.prisma.companyMember.update({ where: { id: memberId }, data: dto as any });
    await this.events.logAudit(user.companyId, user.sub, 'UPDATE', 'member', memberId, { roleId: member.roleId }, dto);
    return updated;
  }

  async removeMember(user: AuthUser, memberId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId: user.companyId },
    });
    if (!member) throw new NotFoundException('Member not found');
    const updated = await this.prisma.companyMember.update({
      where: { id: memberId },
      data: { status: 'INACTIVE' },
    });
    await this.events.logAudit(user.companyId, user.sub, 'REMOVE', 'member', memberId, { status: member.status }, { status: 'INACTIVE' });
    return updated;
  }

  async getRoles(user: AuthUser) {
    return this.prisma.role.findMany({
      where: { companyId: user.companyId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }
}
