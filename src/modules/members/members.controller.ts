import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { MembersService, InviteMemberDto, UpdateMemberDto } from './members.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get()
  @RequirePermissions('member:view')
  findAll(@CurrentUser() user: AuthUser) {
    return this.membersService.findAll(user);
  }

  @Get('roles')
  @RequirePermissions('member:view')
  getRoles(@CurrentUser() user: AuthUser) {
    return this.membersService.getRoles(user);
  }

  @Post('invite')
  @RequirePermissions('member:invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteMemberDto) {
    return this.membersService.invite(user, dto);
  }

  @Post('accept/:token')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.membersService.acceptInvitation(token, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('member:update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.membersService.updateMember(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('member:remove')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.membersService.removeMember(user, id);
  }
}

@Controller('project-members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private prisma: PrismaService) {}

  @Get(':projectId')
  @RequirePermissions('project:view')
  async findAll(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        role: true,
      },
    });
  }

  @Post(':projectId')
  @RequirePermissions('project:update')
  async add(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: { userId: string; roleId: string },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.prisma.projectMember.create({
      data: { projectId, userId: body.userId, roleId: body.roleId },
    });
  }

  @Delete(':projectId/:memberId')
  @RequirePermissions('project:update')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
    });
    if (!project) throw new NotFoundException('Project not found');
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });
    if (!member) throw new NotFoundException('Project member not found');
    return this.prisma.projectMember.delete({ where: { id: memberId } });
  }
}
