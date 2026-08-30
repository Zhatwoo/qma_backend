import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlanningController {
  constructor(private planningService: PlanningService) {}

  @Get('requirements')
  @RequirePermissions('project:view')
  getRequirements(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.planningService.getRequirements(user, projectId);
  }

  @Post('requirements')
  @RequirePermissions('project:update')
  createRequirement(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() dto: any) {
    return this.planningService.createRequirement(user, projectId, dto);
  }

  @Patch('requirements/:id')
  @RequirePermissions('project:update')
  updateRequirement(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.planningService.updateRequirement(user, projectId, id, dto);
  }

  @Delete('requirements/:id')
  @RequirePermissions('project:update')
  deleteRequirement(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planningService.deleteRequirement(user, projectId, id);
  }

  @Get('releases')
  @RequirePermissions('project:view')
  getReleases(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.planningService.getReleases(user, projectId);
  }

  @Post('releases')
  @RequirePermissions('release:create')
  createRelease(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() dto: any) {
    return this.planningService.createRelease(user, projectId, dto);
  }

  @Patch('releases/:id')
  @RequirePermissions('release:update')
  updateRelease(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.planningService.updateRelease(user, projectId, id, dto);
  }

  @Delete('releases/:id')
  @RequirePermissions('release:update')
  deleteRelease(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planningService.deleteRelease(user, projectId, id);
  }

  @Get('releases/:releaseId/gate')
  @RequirePermissions('release:approve')
  evaluateGate(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('releaseId') releaseId: string,
  ) {
    return this.planningService.evaluateReleaseGate(user, projectId, releaseId);
  }

  @Get('sprints')
  @RequirePermissions('project:view')
  getSprints(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.planningService.getSprints(user, projectId);
  }

  @Post('sprints')
  @RequirePermissions('project:update')
  createSprint(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() dto: any) {
    return this.planningService.createSprint(user, projectId, dto);
  }

  @Patch('sprints/:id')
  @RequirePermissions('project:update')
  updateSprint(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.planningService.updateSprint(user, projectId, id, dto);
  }

  @Delete('sprints/:id')
  @RequirePermissions('project:update')
  deleteSprint(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.planningService.deleteSprint(user, projectId, id);
  }

  @Get('traceability')
  @RequirePermissions('project:view')
  getTraceability(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.planningService.getTraceabilityMatrix(user, projectId);
  }
}
