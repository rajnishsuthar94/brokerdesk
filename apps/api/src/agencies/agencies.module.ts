import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';
import { AgencyInvitationsController, InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  controllers: [AgenciesController, MembersController, AgencyInvitationsController, InvitationsController],
  providers: [AgenciesService, MembersService, InvitationsService],
  exports: [AgenciesService, MembersService],
})
export class AgenciesModule {}
