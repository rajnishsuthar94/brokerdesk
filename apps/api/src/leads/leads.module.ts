import { Module } from '@nestjs/common';
import { AgenciesModule } from '../agencies/agencies.module.js';
import { LeadFileService } from './lead-file.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [AgenciesModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadFileService],
})
export class LeadsModule {}
