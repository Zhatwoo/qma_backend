import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { DashboardService, ReportsService, AuditService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    private dashboard: DashboardService,
    private reports: ReportsService,
    private audit: AuditService,
  ) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboard.getDashboard(user);
  }

  @Get('dashboard/charts')
  getCharts(@CurrentUser() user: AuthUser) {
    return this.dashboard.getCharts(user);
  }

  @Get('my-work')
  getMyWork(@CurrentUser() user: AuthUser) {
    return this.dashboard.getMyWork(user);
  }

  @Get('reports/bug-summary')
  @RequirePermissions('report:view')
  bugSummary(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    return this.reports.bugSummary(user, projectId);
  }

  @Get('reports/qa-productivity')
  @RequirePermissions('report:view')
  qaProductivity(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    return this.reports.qaProductivity(user, projectId);
  }

  @Get('audit-logs')
  @RequirePermissions('audit:view')
  auditLogs(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.audit.getAuditLogs(user, page, limit);
  }

  @Get('projects/:projectId/activity')
  @RequirePermissions('project:view')
  activityFeed(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.audit.getActivityFeed(user, projectId);
  }
}
