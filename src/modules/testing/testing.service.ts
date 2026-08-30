import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { paginate, paginatedResponse, PaginationDto } from '../../common/dto/pagination.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class TestingService {
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

  // ─── Test Suites ───────────────────────────────────────────────────────────
  async getSuites(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    return this.prisma.testSuite.findMany({
      where: { projectId, deletedAt: null },
      include: { _count: { select: { testCases: true } } },
    });
  }

  async createSuite(user: AuthUser, projectId: string, dto: { name: string; description?: string }) {
    await this.getProject(user, projectId);
    const suite = await this.prisma.testSuite.create({ data: { projectId, ...dto } });
    await this.events.logActivity(projectId, user.sub, 'CREATED', 'test_suite', suite.id, `Created test suite ${suite.name}`);
    return suite;
  }

  async updateSuite(user: AuthUser, projectId: string, id: string, dto: { name?: string; description?: string }) {
    await this.getProject(user, projectId);
    const suite = await this.prisma.testSuite.findFirst({ where: { id, projectId, deletedAt: null } });
    if (!suite) throw new NotFoundException('Test suite not found');
    return this.prisma.testSuite.update({ where: { id }, data: dto });
  }

  async deleteSuite(user: AuthUser, projectId: string, id: string) {
    await this.getProject(user, projectId);
    return this.prisma.testSuite.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Test Cases ──────────────────────────────────────────────────────────
  async getTestCases(user: AuthUser, projectId: string, query: PaginationDto) {
    await this.getProject(user, projectId);
    const { page = 1, limit = 25, search } = query;
    const where = {
      projectId,
      deletedAt: null,
      ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.testCase.findMany({
        where,
        ...paginate(page, limit),
        include: {
          testSuite: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { steps: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.testCase.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async getTestCase(user: AuthUser, projectId: string, id: string) {
    await this.getProject(user, projectId);
    const tc = await this.prisma.testCase.findFirst({
      where: { id, projectId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        testSuite: true,
        requirement: { select: { id: true, requirementKey: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!tc) throw new NotFoundException('Test case not found');
    return tc;
  }

  async createTestCase(user: AuthUser, projectId: string, dto: any) {
    const project = await this.getProject(user, projectId);
    const count = await this.prisma.testCase.count({ where: { projectId } });
    const testCaseKey = `TC-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.testCase.create({
      data: {
        projectId,
        testCaseKey,
        title: dto.title,
        description: dto.description,
        testSuiteId: dto.testSuiteId,
        requirementId: dto.requirementId,
        type: dto.type || 'FUNCTIONAL',
        priority: dto.priority || 'NORMAL',
        preconditions: dto.preconditions,
        testData: dto.testData,
        expectedResult: dto.expectedResult,
        environment: dto.environment,
        tags: dto.tags || [],
        createdById: user.sub,
        steps: dto.steps?.length
          ? {
              create: dto.steps.map((s: any, i: number) => ({
                stepNumber: i + 1,
                action: s.action,
                expectedResult: s.expectedResult,
              })),
            }
          : undefined,
      },
      include: { steps: true },
    });
  }

  async updateTestCase(user: AuthUser, projectId: string, id: string, dto: any) {
    const tc = await this.getTestCase(user, projectId, id);
    const isManager = user.permissions.includes('issue:assign') || user.permissions.includes('project:update');
    if (!isManager && tc.createdById !== user.sub) {
      throw new ForbiddenException('You can only edit test cases you created');
    }
    if (dto.steps) {
      await this.prisma.testCaseStep.deleteMany({ where: { testCaseId: id } });
      await this.prisma.testCaseStep.createMany({
        data: dto.steps.map((s: any, i: number) => ({
          testCaseId: id,
          stepNumber: i + 1,
          action: s.action,
          expectedResult: s.expectedResult,
        })),
      });
    }
    const { steps, ...data } = dto;
    return this.prisma.testCase.update({ where: { id }, data });
  }

  async deleteTestCase(user: AuthUser, projectId: string, id: string) {
    await this.getTestCase(user, projectId, id);
    return this.prisma.testCase.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Test Runs ─────────────────────────────────────────────────────────────
  async getTestRuns(user: AuthUser, projectId: string) {
    await this.getProject(user, projectId);
    return this.prisma.testRun.findMany({
      where: { projectId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTestRun(user: AuthUser, projectId: string, dto: any) {
    await this.getProject(user, projectId);
    const testCaseIds: string[] = dto.testCaseIds || [];

    if (dto.testSuiteId && !testCaseIds.length) {
      const cases = await this.prisma.testCase.findMany({
        where: { testSuiteId: dto.testSuiteId, deletedAt: null },
        select: { id: true },
      });
      testCaseIds.push(...cases.map((c) => c.id));
    }

    const run = await this.prisma.testRun.create({
      data: {
        projectId,
        name: dto.name,
        environment: dto.environment,
        releaseId: dto.releaseId,
        sprintId: dto.sprintId,
        assignedToId: dto.assignedToId || user.sub,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        createdById: user.sub,
        results: {
          create: testCaseIds.map((testCaseId) => ({ testCaseId })),
        },
      },
      include: { results: { include: { testCase: true } } },
    });
    await this.events.logActivity(projectId, user.sub, 'CREATED', 'test_run', run.id, `Started test run ${run.name}`, undefined, { environment: run.environment });
    return run;
  }

  async getTestRun(user: AuthUser, projectId: string, runId: string) {
    await this.getProject(user, projectId);
    const run = await this.prisma.testRun.findFirst({
      where: { id: runId, projectId },
      include: {
        results: {
          include: {
            testCase: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
            executedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!run) throw new NotFoundException('Test run not found');
    return run;
  }

  async executeResult(user: AuthUser, projectId: string, runId: string, resultId: string, dto: any) {
    await this.getTestRun(user, projectId, runId);
    const result = await this.prisma.testResult.update({
      where: { id: resultId },
      data: {
        status: dto.status,
        actualResult: dto.actualResult,
        notes: dto.notes,
        executedById: user.sub,
        executedAt: new Date(),
      },
      include: { testCase: true },
    });

    if (dto.status === 'FAIL' && dto.createIssue) {
      // Issue creation handled by caller or separate endpoint
    }

    await this.events.logActivity(projectId, user.sub, 'UPDATED', 'test_result', resultId, `Recorded ${dto.status} result`, result.testCase?.testCaseKey);

    return result;
  }

  async cancelTestRun(user: AuthUser, projectId: string, runId: string) {
    await this.getTestRun(user, projectId, runId);
    return this.prisma.testRun.update({ where: { id: runId }, data: { status: 'CANCELLED' } });
  }
}
