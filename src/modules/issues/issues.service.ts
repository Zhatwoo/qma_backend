import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../../common/dto/pagination.dto';
import { ISSUE_TRANSITIONS, DEVELOPER_SETTABLE_STATUSES, QA_SETTABLE_STATUSES } from '../../common/constants';
import { IssueStatus, IssueSeverity, IssuePriority } from '@prisma/client';
import { EventsService } from '../events/events.service';

@Injectable()
export class IssuesService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private async getProject(user: AuthUser, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private isIssueManager(user: AuthUser) {
    return user.permissions.includes('issue:assign') || user.permissions.includes('issue:update');
  }

  private assertCanSubmitFix(user: AuthUser) {
    if (!user.permissions.includes('issue:submit-fix')) {
      throw new ForbiddenException('Only developers can submit fixes for QA');
    }
  }

  private assertCanRetest(user: AuthUser) {
    if (!user.permissions.includes('issue:retest')) {
      throw new ForbiddenException('Only QA can perform retests');
    }
  }

  private assertCanEditIssue(user: AuthUser, issue: { reportedById: string }) {
    if (this.isIssueManager(user)) return;
    if (user.permissions.includes('issue:edit-own') && issue.reportedById === user.sub) return;
    throw new ForbiddenException('You can only edit issues you reported');
  }

  private assertCanTakeTask(user: AuthUser, issue: { assignedToId: string | null }) {
    if (!user.permissions.includes('issue:dev-status') && !user.permissions.includes('issue:submit-fix')) {
      throw new ForbiddenException('Only developers can take tasks');
    }
    if (issue.assignedToId && issue.assignedToId !== user.sub) {
      throw new ForbiddenException('This task is already taken by another developer');
    }
  }

  private assertDeveloperCanWorkOnIssue(user: AuthUser, issue: { assignedToId: string | null }) {
    if (this.isIssueManager(user)) return;
    if (!user.permissions.includes('issue:dev-status')) return;
    if (issue.assignedToId && issue.assignedToId !== user.sub) {
      throw new ForbiddenException('This task is assigned to another developer');
    }
  }

  private isDeveloper(user: AuthUser) {
    return user.permissions.includes('issue:dev-status') || user.permissions.includes('issue:submit-fix');
  }

  private async emitIssue(user: AuthUser, projectId: string, issueId: string, payload: unknown) {
    this.events.emitIssueUpdate(user.companyId, projectId, issueId, payload);
  }

  private async recordHistory(issueId: string, userId: string, field: string, oldValue: string | null, newValue: string | null) {
    await this.prisma.issueHistory.create({
      data: { issueId, userId, field, oldValue, newValue },
    });
  }

  private assertStatusChangeAllowed(user: AuthUser, status: IssueStatus) {
    if (this.isIssueManager(user)) return;

    if (user.permissions.includes('issue:dev-status')) {
      if (!(DEVELOPER_SETTABLE_STATUSES as readonly string[]).includes(status)) {
        throw new ForbiddenException('Developers cannot set this issue status. Use Submit Fix for QA.');
      }
      return;
    }

    if (user.permissions.includes('issue:retest')) {
      if (!(QA_SETTABLE_STATUSES as readonly string[]).includes(status)) {
        throw new ForbiddenException('QA cannot set this issue status');
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions to update issue status');
  }

  private async generateIssueKey(projectId: string, projectKey: string) {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { issueCounter: { increment: 1 } },
    });
    return `${projectKey}-QA-${String(project.issueCounter).padStart(6, '0')}`;
  }

  async findAll(user: AuthUser, projectId: string, query: PaginationDto & Record<string, any>) {
    await this.getProject(user, projectId);
    const { page = 1, limit = 25, search, sort, ...filters } = query;
    const where: any = {
      projectId,
      deletedAt: null,
      ...(filters.status && { status: filters.status as IssueStatus }),
      ...(filters.severity && { severity: filters.severity as IssueSeverity }),
      ...(filters.priority && { priority: filters.priority as IssuePriority }),
      ...(filters.assignedToId && { assignedToId: filters.assignedToId }),
      ...(filters.releaseId && { releaseId: filters.releaseId }),
      ...(filters.sprintId && { sprintId: filters.sprintId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { issueKey: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy = sort
      ? { [sort.split(':')[0]]: sort.split(':')[1] || 'desc' }
      : { updatedAt: 'desc' as const };

    const [rawData, total] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        ...paginate(page, limit),
        orderBy,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          assignedQa: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          reportedBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          requirement: { select: { id: true, requirementKey: true, title: true } },
          sprint: { select: { id: true, name: true } },
          testCase: { select: { id: true, testCaseKey: true, title: true } },
        },
      }),
      this.prisma.issue.count({ where }),
    ]);

    const staleOpenIds = rawData.filter((i) => i.status === 'OPEN' && i.assignedToId).map((i) => i.id);
    if (staleOpenIds.length) {
      await this.prisma.issue.updateMany({
        where: { id: { in: staleOpenIds } },
        data: { assignedToId: null },
      });
    }

    const data = rawData.map((issue) =>
      issue.status === 'OPEN' && issue.assignedToId
        ? { ...issue, assignedToId: null, assignedTo: null }
        : issue,
    );
    return paginatedResponse(data, total, page, limit);
  }

  private async findIssueForAction(user: AuthUser, projectId: string, issueId: string) {
    await this.getProject(user, projectId);
    const issue = await this.prisma.issue.findFirst({
      where: { id: issueId, projectId, deletedAt: null },
      select: {
        id: true,
        issueKey: true,
        title: true,
        status: true,
        assignedToId: true,
        reportedById: true,
        assignedQaId: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private issueAssignInclude = {
    assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  } as const;

  async findOne(user: AuthUser, projectId: string, issueId: string) {
    await this.getProject(user, projectId);
    const issue = await this.prisma.issue.findFirst({
      where: { id: issueId, projectId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } },
        assignedQa: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reportedBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        testCase: { select: { id: true, testCaseKey: true, title: true } },
        requirement: { select: { id: true, requirementKey: true, title: true } },
        release: { select: { id: true, name: true, version: true } },
        sprint: { select: { id: true, name: true } },
        comments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            replies: {
              include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
            },
          },
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
        },
        retests: {
          include: { qaUser: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { retestNumber: 'asc' },
        },
        developerFixes: {
          include: { developer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
        tags: { include: { tag: true } },
      },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return await this.sanitizeOpenIssueAssignee(issue);
  }

  /** OPEN issues must not retain a developer assignee (stale data from older releases). */
  private async sanitizeOpenIssueAssignee<T extends { id: string; status: string; assignedToId: string | null; assignedTo?: unknown }>(
    issue: T,
  ): Promise<T> {
    if (issue.status !== 'OPEN' || !issue.assignedToId) return issue;
    await this.prisma.issue.update({
      where: { id: issue.id },
      data: { assignedToId: null },
    });
    return { ...issue, assignedToId: null, assignedTo: null };
  }

  async create(user: AuthUser, projectId: string, dto: any) {
    const project = await this.getProject(user, projectId);
    const issueKey = await this.generateIssueKey(projectId, project.projectKey);

    const issue = await this.prisma.issue.create({
      data: {
        projectId,
        issueKey,
        title: dto.title,
        description: dto.description,
        severity: dto.severity || 'MEDIUM',
        priority: dto.priority || 'NORMAL',
        status: 'OPEN',
        stepsToReproduce: dto.stepsToReproduce,
        expectedResult: dto.expectedResult,
        actualResult: dto.actualResult,
        environment: dto.environment,
        assignedToId: dto.assignedToId,
        assignedQaId: dto.assignedQaId || user.sub,
        reportedById: user.sub,
        requirementId: dto.requirementId,
        testCaseId: dto.testCaseId,
        testRunId: dto.testRunId,
        testResultId: dto.testResultId,
        releaseId: dto.releaseId,
        sprintId: dto.sprintId,
        os: dto.os,
        browser: dto.browser,
        browserVersion: dto.browserVersion,
        device: dto.device,
        buildNumber: dto.buildNumber,
      },
    });

    await this.prisma.issueHistory.create({
      data: { issueId: issue.id, userId: user.sub, field: 'status', oldValue: null, newValue: 'OPEN' },
    });

    await this.events.logActivity(projectId, user.sub, 'CREATED', 'issue', issue.id, `Created task ${issueKey}`, issueKey);
    await this.emitIssue(user, projectId, issue.id, issue);

    return issue;
  }

  async updateStatus(user: AuthUser, projectId: string, issueId: string, status: IssueStatus) {
    const issue = await this.findIssueForAction(user, projectId, issueId);
    this.assertDeveloperCanWorkOnIssue(user, issue);
    this.assertStatusChangeAllowed(user, status);
    const allowed = ISSUE_TRANSITIONS[issue.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${issue.status} to ${status}`);
    }

    if (['PASSED', 'CLOSED'].includes(status) && !user.permissions.includes('issue:close')) {
      throw new ForbiddenException('Only QA can close issues');
    }

    const shouldAutoAssign = this.isDeveloper(user) && !this.isIssueManager(user)
      && status !== 'OPEN'
      && (!issue.assignedToId || issue.assignedToId === user.sub);

    const shouldClearAssignee = status === 'OPEN' && issue.assignedToId != null;

    const updated = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        status,
        ...(shouldAutoAssign && { assignedToId: user.sub }),
        ...(shouldClearAssignee && { assignedToId: null }),
        ...(status === 'CLOSED' && { closedAt: new Date() }),
      },
      include: this.issueAssignInclude,
    });

    await this.recordHistory(issueId, user.sub, 'status', issue.status, status);

    if (shouldAutoAssign && issue.assignedToId !== user.sub) {
      await this.recordHistory(
        issueId,
        user.sub,
        'assignee',
        issue.assignedTo?.firstName ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}` : null,
        `${updated.assignedTo?.firstName} ${updated.assignedTo?.lastName}`,
      );
    }

    if (shouldClearAssignee) {
      await this.recordHistory(
        issueId,
        user.sub,
        'assignee',
        issue.assignedTo ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}` : null,
        null,
      );
    }

    await this.emitIssue(user, projectId, issueId, updated);
    await this.events.logActivity(projectId, user.sub, 'STATUS_CHANGED', 'issue', issueId, `Status changed to ${status}`, issue.issueKey, { from: issue.status, to: status });

    return updated;
  }

  async releaseTask(user: AuthUser, projectId: string, issueId: string) {
    const issue = await this.findIssueForAction(user, projectId, issueId);

    if (!this.isIssueManager(user)) {
      if (!user.permissions.includes('issue:dev-status') && !user.permissions.includes('issue:submit-fix')) {
        throw new ForbiddenException('Only developers can release tasks');
      }
      if (!issue.assignedToId || issue.assignedToId !== user.sub) {
        throw new ForbiddenException('You can only release tasks assigned to you');
      }
    }

    const releasable = ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'REOPENED'];
    if (!releasable.includes(issue.status)) {
      throw new BadRequestException('Cannot release task at this stage');
    }

    const updated = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        assignedToId: null,
        status: 'OPEN',
      },
      include: this.issueAssignInclude,
    });

    if (issue.status !== 'OPEN') {
      await this.recordHistory(issueId, user.sub, 'status', issue.status, 'OPEN');
    }

    await this.recordHistory(
      issueId,
      user.sub,
      'assignee',
      issue.assignedTo ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}` : null,
      null,
    );

    await this.emitIssue(user, projectId, issueId, updated);
    await this.events.logActivity(projectId, user.sub, 'UPDATED', 'issue', issueId, 'Released task', issue.issueKey);

    return updated;
  }

  async takeTask(user: AuthUser, projectId: string, issueId: string) {
    const issue = await this.findIssueForAction(user, projectId, issueId);
    this.assertCanTakeTask(user, issue);

    const newStatus = issue.status === 'OPEN' || issue.status === 'REOPENED' ? 'ASSIGNED' : issue.status;

    const updated = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        assignedToId: user.sub,
        ...((issue.status === 'OPEN' || issue.status === 'REOPENED') && { status: 'ASSIGNED' as IssueStatus }),
      },
      include: this.issueAssignInclude,
    });

    if (issue.status === 'OPEN' || issue.status === 'REOPENED') {
      await this.recordHistory(issueId, user.sub, 'status', issue.status, newStatus);
    }

    await this.recordHistory(
      issueId,
      user.sub,
      'assignee',
      issue.assignedTo ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}` : null,
      `${updated.assignedTo?.firstName} ${updated.assignedTo?.lastName}`,
    );

    await this.emitIssue(user, projectId, issueId, updated);
    await this.events.logActivity(projectId, user.sub, 'ASSIGNED', 'issue', issueId, 'Took task', issue.issueKey);

    return updated;
  }

  async assign(user: AuthUser, projectId: string, issueId: string, assignedToId: string) {
    const issue = await this.findOne(user, projectId, issueId);
    const updated = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        assignedToId,
        ...(issue.status === 'OPEN' ? { status: 'ASSIGNED' } : {}),
      },
      include: this.issueAssignInclude,
    });

    await this.recordHistory(issueId, user.sub, 'assignee', issue.assignedTo?.firstName ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}` : null, `${updated.assignedTo?.firstName} ${updated.assignedTo?.lastName}`);
    await this.events.notify(assignedToId, 'ISSUE_ASSIGNED', 'Task assigned', `You were assigned ${issue.issueKey}: ${issue.title}`, { entityType: 'issue', entityId: issueId });
    await this.events.logActivity(projectId, user.sub, 'ASSIGNED', 'issue', issueId, `Assigned task`, issue.issueKey);
    await this.emitIssue(user, projectId, issueId, updated);

    return updated;
  }

  async submitFix(user: AuthUser, projectId: string, issueId: string, dto: any) {
    this.assertCanSubmitFix(user);
    const issue = await this.findIssueForAction(user, projectId, issueId);
    this.assertDeveloperCanWorkOnIssue(user, issue);
    if (!dto.fixSummary?.trim()) {
      throw new BadRequestException('Fix summary is required');
    }

    const submittableStatuses = ['IN_PROGRESS', 'BLOCKED', 'REOPENED'];
    if (!submittableStatuses.includes(issue.status)) {
      throw new BadRequestException('Mark the issue as In Progress before submitting for QA');
    }

    const fix = await this.prisma.developerFix.create({
      data: {
        issueId,
        developerId: user.sub,
        fixSummary: dto.fixSummary,
        rootCause: dto.rootCause,
        technicalSolution: dto.technicalSolution,
        affectedFiles: dto.affectedFiles,
        branchName: dto.branchName,
        commitUrl: dto.commitUrl,
        pullRequestUrl: dto.pullRequestUrl,
        buildVersion: dto.buildVersion,
        developerNotes: dto.developerNotes,
      },
    });

    let updated = issue;
    if (!issue.assignedToId || issue.assignedToId !== user.sub || issue.status !== 'READY_FOR_QA') {
      updated = await this.prisma.issue.update({
        where: { id: issueId },
        data: {
          assignedToId: issue.assignedToId === user.sub ? issue.assignedToId : user.sub,
          status: 'READY_FOR_QA',
        },
        include: this.issueAssignInclude,
      });
      if (issue.status !== 'READY_FOR_QA') {
        await this.recordHistory(issueId, user.sub, 'status', issue.status, 'READY_FOR_QA');
      }
    }

    const notifyUserId = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: { assignedQaId: true, reportedById: true, issueKey: true },
    });
    if (notifyUserId) {
      const targetId = notifyUserId.assignedQaId || notifyUserId.reportedById;
      if (targetId && targetId !== user.sub) {
        await this.events.notify(targetId, 'ISSUE_READY_FOR_QA', 'Ready for QA', `${notifyUserId.issueKey} is ready for retest`, { entityType: 'issue', entityId: issueId });
      }
    }
    await this.events.logActivity(projectId, user.sub, 'SUBMITTED_FIX', 'issue', issueId, 'Submitted fix for QA', issue.issueKey);
    await this.emitIssue(user, projectId, issueId, updated);

    return { ...fix, issue: updated };
  }

  async retest(user: AuthUser, projectId: string, issueId: string, dto: any) {
    this.assertCanRetest(user);
    const issue = await this.findIssueForAction(user, projectId, issueId);

    if (!['READY_FOR_QA', 'RETESTING'].includes(issue.status)) {
      throw new BadRequestException('Issue is not ready for QA retest');
    }

    const retestCount = await this.prisma.issueRetest.count({ where: { issueId } });
    const newStatus: IssueStatus = dto.result === 'PASSED' ? 'PASSED' : 'REOPENED';
    const prevStatus = issue.status;

    const [retest, updated] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issueRetest.create({
        data: {
          issueId,
          qaUserId: user.sub,
          result: dto.result,
          notes: dto.notes,
          buildVersion: dto.buildVersion,
          environment: dto.environment,
          retestNumber: retestCount + 1,
        },
      });

      const updatedIssue = await tx.issue.update({
        where: { id: issueId },
        data: { status: newStatus },
        include: this.issueAssignInclude,
      });

      if (prevStatus === 'READY_FOR_QA') {
        await tx.issueHistory.create({
          data: { issueId, userId: user.sub, field: 'status', oldValue: 'READY_FOR_QA', newValue: 'RETESTING' },
        });
      }
      await tx.issueHistory.create({
        data: {
          issueId,
          userId: user.sub,
          field: 'status',
          oldValue: prevStatus === 'READY_FOR_QA' ? 'RETESTING' : prevStatus,
          newValue: newStatus,
        },
      });

      return [created, updatedIssue] as const;
    });

    if (newStatus === 'REOPENED') {
      const fullIssue = await this.prisma.issue.findUnique({ where: { id: issueId }, select: { issueKey: true, title: true, assignedToId: true } });
      if (fullIssue?.assignedToId) {
        await this.events.notify(fullIssue.assignedToId, 'ISSUE_REOPENED', 'Task reopened', `${fullIssue.issueKey} was reopened`, { entityType: 'issue', entityId: issueId });
      }
    }
    await this.events.logActivity(projectId, user.sub, 'RETESTED', 'issue', issueId, `Retest result: ${dto.result}`, issue.issueKey);
    await this.emitIssue(user, projectId, issueId, updated);

    return { ...retest, issue: updated };
  }

  async updateIssue(user: AuthUser, projectId: string, issueId: string, dto: any) {
    const issue = await this.findOne(user, projectId, issueId);
    this.assertCanEditIssue(user, issue);

    const updated = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.stepsToReproduce !== undefined && { stepsToReproduce: dto.stepsToReproduce }),
        ...(dto.expectedResult !== undefined && { expectedResult: dto.expectedResult }),
        ...(dto.actualResult !== undefined && { actualResult: dto.actualResult }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.environment !== undefined && { environment: dto.environment }),
        ...(dto.requirementId !== undefined && { requirementId: dto.requirementId || null }),
        ...(dto.sprintId !== undefined && { sprintId: dto.sprintId || null }),
        ...(dto.releaseId !== undefined && { releaseId: dto.releaseId || null }),
      },
    });

    await this.events.logActivity(projectId, user.sub, 'UPDATED', 'issue', issueId, 'Updated task details', issue.issueKey);
    await this.emitIssue(user, projectId, issueId, updated);

    return updated;
  }

  async addComment(user: AuthUser, projectId: string, issueId: string, dto: any) {
    const issue = await this.findOne(user, projectId, issueId);
    const comment = await this.prisma.issueComment.create({
      data: {
        issueId,
        userId: user.sub,
        content: dto.content,
        parentId: dto.parentId,
        mentions: dto.mentions || [],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    const mentions: string[] = dto.mentions || [];
    for (const mentionedId of mentions) {
      if (mentionedId !== user.sub) {
        await this.events.notify(mentionedId, 'MENTION', 'You were mentioned', `Mentioned on ${issue.issueKey}`, { entityType: 'issue', entityId: issueId });
      }
    }

    await this.events.logActivity(projectId, user.sub, 'COMMENTED', 'issue', issueId, 'Posted a comment', issue.issueKey);
    await this.emitIssue(user, projectId, issueId, comment);

    return comment;
  }

  async searchDuplicates(user: AuthUser, projectId: string, title: string) {
    await this.getProject(user, projectId);
    return this.prisma.issue.findMany({
      where: {
        projectId,
        deletedAt: null,
        status: { notIn: ['CLOSED', 'CANCELLED', 'DUPLICATE'] },
        title: { contains: title, mode: 'insensitive' },
      },
      take: 5,
      select: { id: true, issueKey: true, title: true, status: true, severity: true },
    });
  }

  async bulkUpdate(user: AuthUser, projectId: string, issueIds: string[], data: any) {
    await this.getProject(user, projectId);
    return this.prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId },
      data,
    });
  }
}
