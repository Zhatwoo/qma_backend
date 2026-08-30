import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { EventsGateway } from './websocket.gateway';

@Module({
  imports: [JwtModule, ConfigModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebsocketModule {}
