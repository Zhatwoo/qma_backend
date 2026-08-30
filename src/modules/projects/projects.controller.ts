import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  @RequirePermissions('project:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.projectsService.findAll(user, query);
  }

  @Get('key/:projectKey')
  @RequirePermissions('project:view')
  findByKey(@CurrentUser() user: AuthUser, @Param('projectKey') key: string) {
    return this.projectsService.findByKey(user, key);
  }

  @Get(':id')
  @RequirePermissions('project:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.findOne(user, id);
  }

  @Post()
  @RequirePermissions('project:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('project:update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('project:delete')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projectsService.archive(user, id);
  }
}
