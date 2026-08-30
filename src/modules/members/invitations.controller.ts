import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MembersService } from './members.service';
import { AuthService } from '../auth/auth.service';
import { RegisterFromInviteDto } from '../auth/dto/auth.dto';

@Controller('invitations')
export class InvitationsController {
  constructor(
    private membersService: MembersService,
    private authService: AuthService,
  ) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Get(':token')
  getInvitation(@Param('token') token: string) {
    return this.membersService.getInvitationPreview(token);
  }

  @Post(':token/register')
  async registerFromInvite(
    @Param('token') token: string,
    @Body() dto: RegisterFromInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerFromInvitation(token, dto);
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken, ...data } = result;
    return data;
  }
}
