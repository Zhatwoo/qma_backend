import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../../common/dto/pagination.dto';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { EventsService } from '../events/events.service';

export class CreateProjectDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() projectKey: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsString() repositoryUrl?: string;
  @IsOptional() @IsString() stagingUrl?: string;
  @IsOptional() @IsString() productionUrl?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsString() repositoryUrl?: string;
  @IsOptional() @IsString() stagingUrl?: string;
  @IsOptional() @IsString() productionUrl?: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findAll(user: AuthUser, query: PaginationDto) {
    const { page = 1, limit = 25, search } = query;
    const where = {
      companyId: user.companyId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { projectKey: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { issues: true, testCases: true, members: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async findOne(user: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, role: true } },
        modules: true,
        environments: true,
        settings: true,
        _count: { select: { issues: true, testCases: true, testRuns: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async findByKey(user: AuthUser, projectKey: string) {
    const project = await this.prisma.project.findFirst({
      where: { projectKey, companyId: user.companyId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.findOne(user, project.id);
  }

  async create(user: AuthUser, dto: CreateProjectDto) {
    const existing = await this.prisma.project.findFirst({
      where: { companyId: user.companyId, projectKey: dto.projectKey.toUpperCase() },
    });
    if (existing) throw new ConflictException('Project key already exists');

    return this.prisma.project.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        projectKey: dto.projectKey.toUpperCase(),
        description: dto.description,
        status: dto.status,
        repositoryUrl: dto.repositoryUrl,
        stagingUrl: dto.stagingUrl,
        productionUrl: dto.productionUrl,
        settings: { create: {} },
      },
    }).then(async (project) => {
      await this.events.logAudit(user.companyId, user.sub, 'CREATE', 'project', project.id, null, { name: project.name, projectKey: project.projectKey });
      await this.events.logActivity(project.id, user.sub, 'CREATED', 'project', project.id, `Created project ${project.projectKey}`, project.projectKey);
      return project;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    const before = await this.findOne(user, id);
    const updated = await this.prisma.project.update({ where: { id }, data: dto });
    await this.events.logAudit(user.companyId, user.sub, 'UPDATE', 'project', id, before, dto);
    await this.events.logActivity(id, user.sub, 'UPDATED', 'project', id, 'Updated project settings', before.projectKey);
    return updated;
  }

  async archive(user: AuthUser, id: string) {
    const before = await this.findOne(user, id);
    const archived = await this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    });
    await this.events.logAudit(user.companyId, user.sub, 'ARCHIVE', 'project', id, { status: before.status }, { status: 'ARCHIVED' });
    await this.events.logActivity(id, user.sub, 'DELETED', 'project', id, 'Archived project', before.projectKey);
    return archived;
  }
}
