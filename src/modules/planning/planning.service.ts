import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ReleaseHealth } from '@prisma/client';
import { EventsService } from '../events/events.service';

@Injectable()
export class PlanningService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private async getProject(user: AuthUser, projectId: string) {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId, deletedAt: null },
    });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  // Requirements
  async getRequirements(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    return this.prisma.requirement.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequirement(user: AuthUser, projectId: string, dto: any) {
    await this.getProject(user, projectId);
    const count = await this.prisma.requirement.count({ where: { projectId } });
    return this.prisma.requirement.create({
      data: {
        projectId,
        requirementKey: `REQ-${String(count + 1).padStart(3, '0')}`,
        title: dto.title,
        description: dto.description,
        type: dto.type || 'FUNCTIONAL',
        priority: dto.priority || 'NORMAL',
        acceptanceCriteria: dto.acceptanceCriteria,
        releaseId: dto.releaseId,
        sprintId: dto.sprintId,
        createdById: user.sub,
      },
    });
  }

  async updateRequirement(user: AuthUser, projectId: string, id: string, dto: any) {
    await this.getProject(user, projectId);
    const req = await this.prisma.requirement.findFirst({ where: { id, projectId, deletedAt: null } });
    if (!req) throw new NotFoundException('Requirement not found');
    return this.prisma.requirement.update({ where: { id }, data: dto });
  }

  async deleteRequirement(user: AuthUser, projectId: string, id: string) {
    await this.getProject(user, projectId);
    return this.prisma.requirement.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // Releases
  async getReleases(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    return this.prisma.release.findMany({
      where: { projectId, deletedAt: null },
      include: { _count: { select: { issues: true, testRuns: true } } },
      orderBy: { targetDate: 'desc' },
    });
  }

  async createRelease(user: AuthUser, projectId: string, dto: any) {
    await this.getProject(user, projectId);
    return this.prisma.release.create({
      data: {
        projectId,
        name: dto.name,
        version: dto.version,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        managerId: dto.managerId || user.sub,
      },
    });
  }

  async updateRelease(user: AuthUser, projectId: string, id: string, dto: any) {
    await this.getProject(user, projectId);
    const release = await this.prisma.release.findFirst({ where: { id, projectId, deletedAt: null } });
    if (!release) throw new NotFoundException('Release not found');
    const data = { ...dto };
    if (dto.targetDate) data.targetDate = new Date(dto.targetDate);
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    return this.prisma.release.update({ where: { id }, data });
  }

  async deleteRelease(user: AuthUser, projectId: string, id: string) {
    await this.getProject(user, projectId);
    return this.prisma.release.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async evaluateReleaseGate(user: AuthUser, projectId: string, releaseId: string) {
    await this.getProject(user, projectId);
    const release = await this.prisma.release.findFirst({ where: { id: releaseId, projectId } });
    if (!release) throw new NotFoundException('Release not found');

    const [criticalBugs, highBugs, testResults] = await Promise.all([
      this.prisma.issue.count({
        where: { releaseId, severity: 'CRITICAL', status: { notIn: ['CLOSED', 'CANCELLED'] } },
      }),
      this.prisma.issue.count({
        where: { releaseId, severity: 'HIGH', status: { notIn: ['CLOSED', 'CANCELLED'] } },
      }),
      this.prisma.testResult.findMany({
        where: { testRun: { releaseId } },
        select: { status: true },
      }),
    ]);

    const total = testResults.length;
    const passed = testResults.filter((r) => r.status === 'PASS').length;
    const failed = testResults.filter((r) => r.status === 'FAIL').length;
    const blocked = testResults.filter((r) => r.status === 'BLOCKED').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    const reasons: string[] = [];
    let health: ReleaseHealth = 'READY';

    if (criticalBugs > 0) {
      reasons.push(`${criticalBugs} critical bug(s) remain open`);
      health = 'NOT_READY';
    }
    if (highBugs > 0) {
      reasons.push(`${highBugs} high severity bug(s) remain open`);
      health = health === 'NOT_READY' ? 'NOT_READY' : 'AT_RISK';
    }
    if (passRate < 95 && total > 0) {
      reasons.push(`Regression pass rate is only ${passRate}%`);
      health = 'NOT_READY';
    }
    if (blocked > 0) {
      reasons.push(`${blocked} blocked test(s)`);
      health = health === 'READY' ? 'AT_RISK' : health;
    }

    await this.prisma.release.update({ where: { id: releaseId }, data: { health } });

    return { health, reasons, stats: { criticalBugs, highBugs, passRate, total, passed, failed, blocked } };
  }

  // Sprints
  async getSprints(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    return this.prisma.sprint.findMany({
      where: { projectId },
      include: { _count: { select: { issues: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async createSprint(user: AuthUser, projectId: string, dto: any) {
    await this.getProject(user, projectId);
    return this.prisma.sprint.create({
      data: {
        projectId,
        releaseId: dto.releaseId,
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async updateSprint(user: AuthUser, projectId: string, id: string, dto: any) {
    await this.getProject(user, projectId);
    const sprint = await this.prisma.sprint.findFirst({ where: { id, projectId } });
    if (!sprint) throw new NotFoundException('Sprint not found');
    const data = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    return this.prisma.sprint.update({ where: { id }, data });
  }

  async deleteSprint(user: AuthUser, projectId: string, id: string) {
    await this.getProject(user, projectId);
    return this.prisma.sprint.delete({ where: { id } });
  }

  // Traceability
  async getTraceabilityMatrix(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    const requirements = await this.prisma.requirement.findMany({
      where: { projectId, deletedAt: null },
      include: {
        testCases: {
          include: {
            testResults: { take: 1, orderBy: { executedAt: 'desc' } },
            issues: { select: { id: true, issueKey: true, status: true } },
          },
        },
      },
    });

    const rows: Array<Record<string, unknown>> = [];
    for (const req of requirements) {
      if (req.testCases.length) {
        for (const tc of req.testCases) {
          rows.push({
            requirement: { key: req.requirementKey, title: req.title },
            testCase: { key: tc.testCaseKey, title: tc.title },
            testResult: tc.testResults[0]?.status || 'NOT_RUN',
            issue: tc.issues[0] || null,
            status: tc.issues[0]?.status || (tc.testResults[0]?.status === 'PASS' ? 'PASSED' : 'PENDING'),
          });
        }
      } else {
        rows.push({
          requirement: { key: req.requirementKey, title: req.title },
          testCase: null,
          testResult: null,
          issue: null,
          status: 'NO_TESTS',
        });
      }
    }
    return rows;
  }
}
