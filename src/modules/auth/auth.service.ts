import {

  Injectable,

  UnauthorizedException,

  ConflictException,

  BadRequestException,

  NotFoundException,

} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { ConfigService } from '@nestjs/config';

import * as bcrypt from 'bcrypt';

import { randomBytes } from 'crypto';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import {

  RegisterDto,

  LoginDto,

  ForgotPasswordDto,

  ResetPasswordDto,

  ChangePasswordDto,

  RegisterFromInviteDto,

} from './dto/auth.dto';

import { AuthUser } from '../../common/decorators/current-user.decorator';

import {
  JOINABLE_ROLE_SLUGS,
  ROLE_DISPLAY_NAMES,
  ROLE_PERMISSIONS,
} from '../../common/constants';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {

  constructor(

    private prisma: PrismaService,

    private jwt: JwtService,

    private config: ConfigService,

    private mail: MailService,

  ) {}



  normalizeCompanyCode(code: string) {

    return code

      .trim()

      .toLowerCase()

      .replace(/[^a-z0-9]+/g, '-')

      .replace(/(^-|-$)/g, '');

  }



  private getJoinableRolesMeta() {

    return JOINABLE_ROLE_SLUGS.map((slug) => ({

      slug,

      name: ROLE_DISPLAY_NAMES[slug] || slug,

    }));

  }



  async lookupCompanyCode(rawCode: string) {

    const companyCode = this.normalizeCompanyCode(rawCode);

    if (!companyCode || companyCode.length < 2) {

      return {

        exists: false,

        companyCode,

        joinableRoles: this.getJoinableRolesMeta(),

      };

    }



    const company = await this.prisma.company.findFirst({

      where: { slug: companyCode, deletedAt: null },

      include: {

        roles: {

          where: { slug: { in: [...JOINABLE_ROLE_SLUGS] } },

          select: { slug: true, name: true },

        },

      },

    });



    if (!company) {

      return {

        exists: false,

        companyCode,

        joinableRoles: this.getJoinableRolesMeta(),

      };

    }



    return {

      exists: true,

      companyCode: company.slug,

      companyName: company.name,

      joinableRoles: company.roles.map((role) => ({

        slug: role.slug,

        name: role.name,

      })),

    };

  }



  async getUserPermissions(userId: string, companyId: string): Promise<string[]> {

    const member = await this.prisma.companyMember.findFirst({

      where: { userId, companyId, status: 'ACTIVE' },

      include: {

        role: {

          include: {

            rolePermissions: { include: { permission: true } },

          },

        },

      },

    });

    if (!member) return [];

    return member.role.rolePermissions.map((rp) => rp.permission.name);

  }



  private async buildTokenPayload(userId: string, companyId: string): Promise<AuthUser> {

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const permissions = await this.getUserPermissions(userId, companyId);

    return {

      sub: userId,

      email: user!.email,

      companyId,

      permissions,

    };

  }



  private signAccessToken(payload: AuthUser) {

    return this.jwt.sign(payload, {

      secret: this.config.get('JWT_SECRET'),

      expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m',

    });

  }



  private async createRefreshToken(userId: string) {

    const token = randomBytes(40).toString('hex');

    const expiresAt = new Date();

    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({

      data: { token, userId, expiresAt },

    });

    return token;

  }



  private async seedCompanyRoles(

    tx: Prisma.TransactionClient,

    companyId: string,

    permMap: Map<string, string>,

  ) {

    let adminRoleId = '';



    for (const [roleSlug, perms] of Object.entries(ROLE_PERMISSIONS)) {

      const role = await tx.role.create({

        data: {

          name: ROLE_DISPLAY_NAMES[roleSlug] || roleSlug,

          slug: roleSlug,

          isSystem: true,

          companyId,

        },

      });



      if (roleSlug === 'company-admin') {

        adminRoleId = role.id;

      }



      await tx.rolePermission.createMany({

        data: perms

          .map((permName) => permMap.get(permName))

          .filter((id): id is string => !!id)

          .map((permissionId) => ({ roleId: role.id, permissionId })),

      });

    }



    return adminRoleId;

  }



  private async buildAuthResponse(userId: string, companyId: string) {

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const member = await this.prisma.companyMember.findFirst({

      where: { userId, companyId, status: 'ACTIVE' },

      include: { company: true, role: true },

    });

    if (!user || !member) {

      throw new UnauthorizedException('No active company membership');

    }



    const payload = await this.buildTokenPayload(userId, companyId);

    const accessToken = this.signAccessToken(payload);

    const refreshToken = await this.createRefreshToken(userId);



    return {

      accessToken,

      refreshToken,

      user: {

        id: user.id,

        email: user.email,

        firstName: user.firstName,

        lastName: user.lastName,

        companyId: member.companyId,

        companyName: member.company.name,

        companyCode: member.company.slug,

        roleName: member.role.name,

        roleSlug: member.role.slug,

        permissions: payload.permissions,

      },

    };

  }



  async register(dto: RegisterDto) {

    const existing = await this.prisma.user.findUnique({

      where: { email: dto.email },

    });

    if (existing) throw new ConflictException('Email already registered');



    const companyCode = this.normalizeCompanyCode(dto.companyCode);

    if (!companyCode || companyCode.length < 2) {

      throw new BadRequestException('Company code must be at least 2 characters');

    }



    const passwordHash = await bcrypt.hash(dto.password, 12);

    const existingCompany = await this.prisma.company.findFirst({

      where: { slug: companyCode, deletedAt: null },

    });



    if (existingCompany) {

      if (!dto.roleSlug) {

        throw new BadRequestException('Select your role to join this company');

      }



      const role = await this.prisma.role.findFirst({

        where: { companyId: existingCompany.id, slug: dto.roleSlug },

      });

      if (!role) throw new BadRequestException('Invalid role for this company');



      const user = await this.prisma.user.create({

        data: {

          email: dto.email,

          passwordHash,

          firstName: dto.firstName,

          lastName: dto.lastName,

        },

      });



      await this.prisma.companyMember.create({

        data: {

          userId: user.id,

          companyId: existingCompany.id,

          roleId: role.id,

        },

      });



      return this.buildAuthResponse(user.id, existingCompany.id);

    }

    if (dto.createCompany) {
      if (!dto.companyName?.trim()) {
        throw new BadRequestException('Company name is required to create a new company');
      }

      const permissions = await this.prisma.permission.findMany();
      const permMap = new Map(permissions.map((p) => [p.name, p.id]));

      const result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.companyName!.trim(),
            slug: companyCode,
            settings: { create: {} },
          },
        });

        const adminRoleId = await this.seedCompanyRoles(tx, company.id, permMap);

        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });

        await tx.companyMember.create({
          data: {
            userId: user.id,
            companyId: company.id,
            roleId: adminRoleId,
          },
        });

        return { userId: user.id, companyId: company.id };
      });

      return this.buildAuthResponse(result.userId, result.companyId);
    }

    throw new BadRequestException('Invalid company code');

  }

  async registerFromInvitation(token: string, dto: RegisterFromInviteDto) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { company: true },
    });

    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired invitation');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in to accept the invitation.',
      );
    }

    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId: invitation.companyId,
        user: { email: invitation.email },
        status: 'ACTIVE',
      },
    });
    if (existingMember) {
      throw new ConflictException('You are already a member of this company');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      await tx.companyMember.create({
        data: {
          userId: created.id,
          companyId: invitation.companyId,
          roleId: invitation.roleId,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return created;
    });

    return this.buildAuthResponse(user.id, invitation.companyId);
  }

  async login(dto: LoginDto) {

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) throw new UnauthorizedException('Invalid credentials');



    const valid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!valid) throw new UnauthorizedException('Invalid credentials');



    const member = await this.prisma.companyMember.findFirst({

      where: { userId: user.id, status: 'ACTIVE' },

    });

    if (!member) throw new UnauthorizedException('No active company membership');



    return this.buildAuthResponse(user.id, member.companyId);

  }



  async refresh(refreshToken: string) {

    const stored = await this.prisma.refreshToken.findUnique({

      where: { token: refreshToken },

    });

    if (!stored || stored.expiresAt < new Date()) {

      throw new UnauthorizedException('Invalid refresh token');

    }



    const { count } = await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    if (count === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }



    const member = await this.prisma.companyMember.findFirst({

      where: { userId: stored.userId, status: 'ACTIVE' },

    });

    if (!member) throw new UnauthorizedException('No active company membership');



    const payload = await this.buildTokenPayload(stored.userId, member.companyId);

    const accessToken = this.signAccessToken(payload);

    const newRefreshToken = await this.createRefreshToken(stored.userId);



    return { accessToken, refreshToken: newRefreshToken };

  }



  async logout(refreshToken: string) {

    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

    return { message: 'Logged out' };

  }



  async forgotPassword(dto: ForgotPasswordDto) {

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) return { message: 'If email exists, reset link sent', emailSent: true };

    const token = randomBytes(32).toString('hex');

    const expiresAt = new Date();

    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.passwordReset.create({

      data: { token, userId: user.id, expiresAt },

    });

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    let emailSent = false;
    try {
      await this.mail.sendPasswordResetEmail(user.email, `${frontendUrl}/reset-password?token=${token}`);
      emailSent = true;
    } catch {
      // Don't leak whether email exists
    }

    return { message: 'If email exists, reset link sent', emailSent };

  }



  async resetPassword(dto: ResetPasswordDto) {

    const reset = await this.prisma.passwordReset.findUnique({

      where: { token: dto.token },

    });

    if (!reset || reset.used || reset.expiresAt < new Date()) {

      throw new BadRequestException('Invalid or expired reset token');

    }



    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([

      this.prisma.user.update({

        where: { id: reset.userId },

        data: { passwordHash },

      }),

      this.prisma.passwordReset.update({

        where: { id: reset.id },

        data: { used: true },

      }),

    ]);



    return { message: 'Password reset successful' };

  }



  async changePassword(userId: string, dto: ChangePasswordDto) {

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const valid = await bcrypt.compare(dto.currentPassword, user!.passwordHash);

    if (!valid) throw new BadRequestException('Current password is incorrect');



    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return { message: 'Password changed' };

  }



  async getProfile(userId: string) {

    const user = await this.prisma.user.findUnique({

      where: { id: userId },

      select: {

        id: true,

        email: true,

        firstName: true,

        lastName: true,

        avatarUrl: true,

        emailVerified: true,

        status: true,

        createdAt: true,

        companyMembers: {

          where: { status: 'ACTIVE' },

          include: { company: true, role: true },

        },

      },

    });

    if (!user) throw new UnauthorizedException('User not found');



    const member = user.companyMembers[0];

    const permissions = member

      ? await this.getUserPermissions(userId, member.companyId)

      : [];



    return {

      id: user.id,

      email: user.email,

      firstName: user.firstName,

      lastName: user.lastName,

      avatarUrl: user.avatarUrl,

      emailVerified: user.emailVerified,

      status: user.status,

      createdAt: user.createdAt,

      companyId: member?.companyId ?? null,

      companyName: member?.company.name ?? null,

      companyCode: member?.company.slug ?? null,

      roleName: member?.role.name ?? null,

      roleSlug: member?.role.slug ?? null,

      permissions,

      companyMembers: user.companyMembers,

    };

  }

}

