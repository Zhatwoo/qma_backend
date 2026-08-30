import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import {
  SearchController,
  NotificationsController,
  SavedFiltersController,
  CompaniesController,
} from './analytics-extra.controller';
import { DashboardService, ReportsService, AuditService } from './analytics.service';

@Module({
  controllers: [
    AnalyticsController,
    SearchController,
    NotificationsController,
    SavedFiltersController,
    CompaniesController,
  ],
  providers: [DashboardService, ReportsService, AuditService],
  exports: [DashboardService, ReportsService, AuditService],
})
export class AnalyticsModule {}
