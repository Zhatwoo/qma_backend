import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Global()
@Module({
  imports: [WebsocketModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
