import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FilesService } from './files.service';

const STARTUP_DELAY_MS = 60_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FilesCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesCleanupScheduler.name);
  private startupTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filesService: FilesService) {}

  onModuleInit() {
    const runCleanup = async () => {
      try {
        const result = await this.filesService.purgeExpiredFiles();
        if (result.deleted > 0 || result.errors > 0) {
          this.logger.log(`Cleanup finished: ${result.deleted} deleted, ${result.errors} errors`);
        }
      } catch (err) {
        this.logger.error('Scheduled file cleanup failed', err instanceof Error ? err.stack : err);
      }
    };

    this.startupTimer = setTimeout(() => {
      void runCleanup();
      this.intervalTimer = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS);
    }, STARTUP_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }
}
