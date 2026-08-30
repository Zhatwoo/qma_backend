import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IssuesService } from './issues.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('projects/:projectId/issues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IssuesController {
  constructor(private issuesService: IssuesService) {}

  @Get()
  @RequirePermissions('issue:view')
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: PaginationDto,
  ) {
    return this.issuesService.findAll(user, projectId, query);
  }

  @Get('duplicates')
  @RequirePermissions('issue:view')
  searchDuplicates(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('title') title: string,
  ) {
    return this.issuesService.searchDuplicates(user, projectId, title);
  }

  @Get(':issueId')
  @RequirePermissions('issue:view')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.issuesService.findOne(user, projectId, issueId);
  }

  @Post()
  @RequirePermissions('issue:create')
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.issuesService.create(user, projectId, dto);
  }

  @Patch(':issueId/status')
  @RequirePermissions('issue:update', 'issue:dev-status', 'issue:retest')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body('status') status: any,
  ) {
    return this.issuesService.updateStatus(user, projectId, issueId, status);
  }

  @Post(':issueId/take')
  @RequirePermissions('issue:dev-status', 'issue:submit-fix')
  takeTask(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.issuesService.takeTask(user, projectId, issueId);
  }

  @Post(':issueId/release')
  @RequirePermissions('issue:dev-status', 'issue:submit-fix', 'issue:assign')
  releaseTask(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ) {
    return this.issuesService.releaseTask(user, projectId, issueId);
  }

  @Patch(':issueId/assign')
  @RequirePermissions('issue:assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body('assignedToId') assignedToId: string,
  ) {
    return this.issuesService.assign(user, projectId, issueId, assignedToId);
  }

  @Post(':issueId/fix')
  @RequirePermissions('issue:submit-fix')
  submitFix(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: any,
  ) {
    return this.issuesService.submitFix(user, projectId, issueId, dto);
  }

  @Post(':issueId/retest')
  @RequirePermissions('issue:retest')
  retest(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: any,
  ) {
    return this.issuesService.retest(user, projectId, issueId, dto);
  }

  @Patch(':issueId')
  @RequirePermissions('issue:update', 'issue:edit-own')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: any,
  ) {
    return this.issuesService.updateIssue(user, projectId, issueId, dto);
  }

  @Post(':issueId/comments')
  @RequirePermissions('issue:view')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: any,
  ) {
    return this.issuesService.addComment(user, projectId, issueId, dto);
  }

  @Post('bulk')
  @RequirePermissions('issue:update')
  bulkUpdate(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: { issueIds: string[]; data: any },
  ) {
    return this.issuesService.bulkUpdate(user, projectId, body.issueIds, body.data);
  }
}
