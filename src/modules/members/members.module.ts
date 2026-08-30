import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController, ProjectMembersController } from './members.controller';
import { InvitationsController } from './invitations.controller';

@Module({
  controllers: [MembersController, ProjectMembersController, InvitationsController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
