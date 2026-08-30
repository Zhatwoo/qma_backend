import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FilesCleanupScheduler } from './files-cleanup.scheduler';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FilesCleanupScheduler],
  exports: [FilesService],
})
export class FilesModule {}
