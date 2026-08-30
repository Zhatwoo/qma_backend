import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../websocket/websocket.gateway';
import { ActivityAction, NotificationType } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    entity?: { entityType?: string; entityId?: string },
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        entityType: entity?.entityType,
        entityId: entity?.entityId,
      },
    });
    this.gateway.emitToUser(userId, 'notification:new', notification);
    return notification;
  }

  async logActivity(
    projectId: string,
    userId: string | null,
    action: ActivityAction,
    entityType: string,
    entityId: string,
    description: string,
    entityKey?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.activityLog.create({
      data: {
        projectId,
        userId,
        action,
        entityType,
        entityId,
        entityKey,
        description,
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  }

  async logAudit(
    companyId: string,
    userId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    oldValue: unknown,
    newValue: unknown,
    ip?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        companyId,
        userId,
        action,
        entity,
        entityId,
        oldValue: oldValue as object,
        newValue: newValue as object,
        ipAddress: ip,
      },
    });
  }

  emitIssueUpdate(companyId: string, projectId: string, issueId: string, payload: unknown) {
    this.gateway.emitToCompany(companyId, 'issue:updated', { projectId, issueId, payload });
    this.gateway.emitToIssue(issueId, 'issue:updated', { projectId, issueId, payload });
  }
}
