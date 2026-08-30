import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { MembersModule } from './modules/members/members.module';
import { IssuesModule } from './modules/issues/issues.module';
import { TestingModule } from './modules/testing/testing.module';
import { PlanningModule } from './modules/planning/planning.module';
import { FilesModule } from './modules/files/files.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { MailModule } from './modules/mail/mail.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    EventsModule,
    AuthModule,
    ProjectsModule,
    MembersModule,
    IssuesModule,
    TestingModule,
    PlanningModule,
    FilesModule,
    AnalyticsModule,
    WebsocketModule,
  ],
})
export class AppModule {}
