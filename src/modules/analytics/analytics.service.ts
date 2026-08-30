import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const [
      totalProjects,
      activeProjects,
      openBugs,
      criticalBugs,
      highBugs,
      readyForQa,
      inProgress,
      reopened,
      totalTestCases,
      testResults,
    ] = await Promise.all([
      this.prisma.project.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.project.count({ where: { companyId: user.companyId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, status: { notIn: ['CLOSED', 'CANCELLED'] }, deletedAt: null } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, severity: 'CRITICAL', status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, severity: 'HIGH', status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, status: 'READY_FOR_QA' } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, status: 'IN_PROGRESS' } }),
      this.prisma.issue.count({ where: { projectId: { in: projectIds }, status: 'REOPENED' } }),
      this.prisma.testCase.count({ where: { projectId: { in: projectIds }, deletedAt: null } }),
      this.prisma.testResult.findMany({
        where: { testRun: { projectId: { in: projectIds } } },
        select: { status: true },
      }),
    ]);

    const executed = testResults.filter((r) => r.status !== 'NOT_RUN').length;
    const passed = testResults.filter((r) => r.status === 'PASS').length;
    const failed = testResults.filter((r) => r.status === 'FAIL').length;
    const blocked = testResults.filter((r) => r.status === 'BLOCKED').length;
    const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

    return {
      totalProjects,
      activeProjects,
      openBugs,
      criticalBugs,
      highBugs,
      readyForQa,
      inProgress,
      reopened,
      totalTestCases,
      testsExecuted: executed,
      testsPassed: passed,
      testsFailed: failed,
      testsBlocked: blocked,
      passRate,
    };
  }

  async getCharts(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    const projectIds = projects.map((p) => p.id);

    const issues = await this.prisma.issue.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null },
      select: { status: true, severity: true, priority: true, projectId: true, assignedToId: true, createdAt: true },
    });

    const bugsByStatus = issues.reduce((acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bugsBySeverity = issues.reduce((acc, i) => {
      acc[i.severity] = (acc[i.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bugsPerProject = projects.map((p) => ({
      name: p.name,
      count: issues.filter((i) => i.projectId === p.id).length,
    }));

    return { bugsByStatus, bugsBySeverity, bugsPerProject };
  }

  async getMyWork(user: AuthUser) {
    const [assignedBugs, readyForRetest, myTestRuns, blockedTests] = await Promise.all([
      this.prisma.issue.findMany({
        where: { assignedToId: user.sub, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] } },
        include: { project: { select: { name: true, projectKey: true } } },
        take: 20,
      }),
      this.prisma.issue.findMany({
        where: { assignedQaId: user.sub, status: { in: ['READY_FOR_QA', 'RETESTING'] } },
        include: { project: { select: { name: true, projectKey: true } } },
        take: 20,
      }),
      this.prisma.testRun.findMany({
        where: { assignedToId: user.sub, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        include: { project: { select: { name: true, projectKey: true } } },
        take: 10,
      }),
      this.prisma.testResult.findMany({
        where: { status: 'BLOCKED', executedById: user.sub },
        include: {
          testCase: { select: { title: true, testCaseKey: true } },
          testRun: { select: { id: true, project: { select: { projectKey: true } } } },
        },
        take: 10,
      }),
    ]);

    return { assignedBugs, readyForRetest, myTestRuns, blockedTests };
  }
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async bugSummary(user: AuthUser, projectId?: string) {
    const where: any = { deletedAt: null, project: { companyId: user.companyId } };
    if (projectId) where.projectId = projectId;

    const issues = await this.prisma.issue.findMany({
      where,
      include: {
        assignedTo: { select: { firstName: true, lastName: true } },
        project: { select: { name: true, projectKey: true } },
      },
    });

    return {
      total: issues.length,
      byStatus: this.groupBy(issues, 'status'),
      bySeverity: this.groupBy(issues, 'severity'),
      byPriority: this.groupBy(issues, 'priority'),
      issues,
    };
  }

  async qaProductivity(user: AuthUser, projectId?: string) {
    const where: any = { project: { companyId: user.companyId } };
    if (projectId) where.projectId = projectId;

    const [testResults, bugsFound, retests] = await Promise.all([
      this.prisma.testResult.count({ where: { ...where, status: { not: 'NOT_RUN' } } }),
      this.prisma.issue.count({ where: { ...where, reportedBy: { companyMembers: { some: { companyId: user.companyId } } } } }),
      this.prisma.issueRetest.count(),
    ]);

    return { testsExecuted: testResults, bugsFound, retestsCompleted: retests };
  }

  private groupBy(arr: any[], key: string) {
    return arr.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async getAuditLogs(user: AuthUser, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { companyId: user.companyId },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where: { companyId: user.companyId } }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async getActivityFeed(user: AuthUser, projectId: string) {
    return this.prisma.activityLog.findMany({
      where: { projectId, project: { companyId: user.companyId } },
      include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async logAudit(companyId: string, userId: string | null, action: string, entity: string, entityId: string | null, oldValue: any, newValue: any, ip?: string) {
    return this.prisma.auditLog.create({
      data: { companyId, userId, action, entity, entityId, oldValue, newValue, ipAddress: ip },
    });
  }
}
