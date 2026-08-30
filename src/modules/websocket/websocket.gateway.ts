import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (token) {
        const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
        client.join(`company:${payload.companyId}`);
        client.join(`user:${payload.sub}`);
      }
    } catch {
      client.disconnect();
    }
  }

  emitToCompany(companyId: string, event: string, data: unknown) {
    this.server.to(`company:${companyId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  @SubscribeMessage('joinIssue')
  handleJoinIssue(client: Socket, issueId: string) {
    client.join(`issue:${issueId}`);
  }

  @SubscribeMessage('leaveIssue')
  handleLeaveIssue(client: Socket, issueId: string) {
    client.leave(`issue:${issueId}`);
  }

  emitToIssue(issueId: string, event: string, data: unknown) {
    this.server.to(`issue:${issueId}`).emit(event, data);
  }
}
