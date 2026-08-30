import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    if (!q || q.length < 2) return { issues: [], projects: [], testCases: [] };

    const [issues, projects, testCases] = await Promise.all([
      this.prisma.issue.findMany({
        where: {
          project: { companyId: user.companyId },
          OR: [
            { issueKey: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          issueKey: true,
          title: true,
          status: true,
          projectId: true,
          project: { select: { projectKey: true } },
        },
        take: 10,
      }),
      this.prisma.project.findMany({
        where: {
          companyId: user.companyId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { projectKey: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, projectKey: true },
        take: 5,
      }),
      this.prisma.testCase.findMany({
        where: {
          project: { companyId: user.companyId },
          OR: [
            { testCaseKey: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          testCaseKey: true,
          title: true,
          projectId: true,
          project: { select: { projectKey: true } },
        },
        take: 10,
      }),
    ]);

    return { issues, projects, testCases };
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getAll(@CurrentUser() user: AuthUser) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const issueIds = notifications
      .filter((n) => n.entityType === 'issue' && n.entityId)
      .map((n) => n.entityId as string);
    const invitationIds = notifications
      .filter((n) => n.entityType === 'invitation' && n.entityId)
      .map((n) => n.entityId as string);

    const [issues, invitations] = await Promise.all([
      issueIds.length
        ? this.prisma.issue.findMany({
            where: { id: { in: issueIds } },
            select: { id: true, project: { select: { projectKey: true } } },
          })
        : [],
      invitationIds.length
        ? this.prisma.invitation.findMany({
            where: { id: { in: invitationIds } },
            select: { id: true, token: true },
          })
        : [],
    ]);

    const issueHref = new Map(
      issues.map((i) => [`issue:${i.id}`, `/projects/${i.project.projectKey}/issues/${i.id}`]),
    );
    const inviteHref = new Map(
      invitations.map((inv) => [`invitation:${inv.id}`, `/accept-invite?token=${inv.token}`]),
    );

    return notifications.map((n) => {
      const key = n.entityType && n.entityId ? `${n.entityType}:${n.entityId}` : '';
      let href: string | null = null;
      if (n.entityType === 'issue') href = issueHref.get(key) ?? null;
      else if (n.entityType === 'invitation') href = inviteHref.get(key) ?? '/members';
      return { ...n, href };
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.count({
      where: { userId: user.sub, isRead: false },
    });
  }

  @Patch('mark-all-read')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.updateMany({
      where: { userId: user.sub, isRead: false },
      data: { isRead: true },
    });
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.notification.update({
      where: { id, userId: user.sub },
      data: { isRead: true },
    });
  }
}

@Controller('saved-filters')
@UseGuards(JwtAuthGuard)
export class SavedFiltersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  getAll(@CurrentUser() user: AuthUser) {
    return this.prisma.savedFilter.findMany({ where: { userId: user.sub } });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; entity: string; filters: Record<string, unknown> },
  ) {
    return this.prisma.savedFilter.create({
      data: { userId: user.sub, companyId: user.companyId, name: body.name, entity: body.entity, filters: body.filters as object },
    });
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.savedFilter.delete({ where: { id, userId: user.sub } });
  }
}

@Controller('companies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompaniesController {
  constructor(private prisma: PrismaService) {}

  @Get('current')
  @RequirePermissions('company:view')
  getCurrent(@CurrentUser() user: AuthUser) {
    return this.prisma.company.findFirst({
      where: { id: user.companyId },
      include: { settings: true },
    });
  }

  @Get('overview')
  @RequirePermissions('company:view')
  async getOverview(@CurrentUser() user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const [company, memberCount, projectCount, activeProjects, openBugs, closedBugs, totalTestCases] =
      await Promise.all([
        this.prisma.company.findFirst({
          where: { id: user.companyId },
          include: { settings: true },
        }),
        this.prisma.companyMember.count({
          where: { companyId: user.companyId, status: 'ACTIVE' },
        }),
        this.prisma.project.count({
          where: { companyId: user.companyId, deletedAt: null },
        }),
        this.prisma.project.count({
          where: { companyId: user.companyId, status: 'ACTIVE', deletedAt: null },
        }),
        this.prisma.issue.count({
          where: {
            projectId: { in: projectIds },
            status: { notIn: ['CLOSED', 'CANCELLED'] },
            deletedAt: null,
          },
        }),
        this.prisma.issue.count({
          where: {
            projectId: { in: projectIds },
            status: 'CLOSED',
            deletedAt: null,
          },
        }),
        this.prisma.testCase.count({
          where: { projectId: { in: projectIds }, deletedAt: null },
        }),
      ]);

    return {
      company,
      stats: {
        memberCount,
        projectCount,
        activeProjects,
        openBugs,
        closedBugs,
        totalTestCases,
      },
    };
  }

  @Patch('current')
  @RequirePermissions('company:update')
  updateCurrent(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const { name, timezone, dateFormat } = body;
    return this.prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(typeof name === 'string' && { name }),
        ...(typeof timezone === 'string' && { timezone }),
        ...(typeof dateFormat === 'string' && { dateFormat }),
      },
    });
  }
}
