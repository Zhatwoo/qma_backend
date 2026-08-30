import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TestingService } from './testing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TestingController {
  constructor(private testingService: TestingService) {}

  @Get('test-suites')
  @RequirePermissions('testcase:view')
  getSuites(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.testingService.getSuites(user, projectId);
  }

  @Post('test-suites')
  @RequirePermissions('testcase:create')
  createSuite(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() dto: any) {
    return this.testingService.createSuite(user, projectId, dto);
  }

  @Patch('test-suites/:id')
  @RequirePermissions('testcase:update')
  updateSuite(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.testingService.updateSuite(user, projectId, id, dto);
  }

  @Delete('test-suites/:id')
  @RequirePermissions('testcase:update')
  deleteSuite(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Param('id') id: string) {
    return this.testingService.deleteSuite(user, projectId, id);
  }

  @Get('test-cases')
  @RequirePermissions('testcase:view')
  getTestCases(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: PaginationDto,
  ) {
    return this.testingService.getTestCases(user, projectId, query);
  }

  @Get('test-cases/:id')
  @RequirePermissions('testcase:view')
  getTestCase(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.testingService.getTestCase(user, projectId, id);
  }

  @Post('test-cases')
  @RequirePermissions('testcase:create')
  createTestCase(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.testingService.createTestCase(user, projectId, dto);
  }

  @Patch('test-cases/:id')
  @RequirePermissions('testcase:update')
  updateTestCase(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.testingService.updateTestCase(user, projectId, id, dto);
  }

  @Delete('test-cases/:id')
  @RequirePermissions('testcase:update')
  deleteTestCase(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.testingService.deleteTestCase(user, projectId, id);
  }

  @Get('test-runs')
  @RequirePermissions('testcase:view')
  getTestRuns(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.testingService.getTestRuns(user, projectId);
  }

  @Post('test-runs')
  @RequirePermissions('testcase:execute')
  createTestRun(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.testingService.createTestRun(user, projectId, dto);
  }

  @Get('test-runs/:runId')
  @RequirePermissions('testcase:view')
  getTestRun(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ) {
    return this.testingService.getTestRun(user, projectId, runId);
  }

  @Patch('test-runs/:runId/cancel')
  @RequirePermissions('testcase:execute')
  cancelTestRun(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ) {
    return this.testingService.cancelTestRun(user, projectId, runId);
  }

  @Patch('test-runs/:runId/results/:resultId')
  @RequirePermissions('testcase:execute')
  executeResult(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Param('resultId') resultId: string,
    @Body() dto: any,
  ) {
    return this.testingService.executeResult(user, projectId, runId, resultId, dto);
  }
}
