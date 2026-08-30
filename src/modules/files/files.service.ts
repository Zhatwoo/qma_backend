import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import { FileEntityType } from '@prisma/client';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join, basename } from 'path';

const DEFAULT_RETENTION_DAYS = 30;
const STORAGE_BUCKET = 'qma-files';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private supabase: SupabaseClient | null = null;
  private uploadDir = join(process.cwd(), 'uploads');
  private readonly retentionDays: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const url = this.config.get('SUPABASE_URL');
    const key = this.config.get('SUPABASE_SERVICE_KEY');
    if (url && key) {
      this.supabase = createClient(url, key);
    }
    const configured = Number(this.config.get('FILE_RETENTION_DAYS'));
    this.retentionDays = Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_RETENTION_DAYS;
  }

  async presign(
    user: AuthUser,
    dto: {
      fileName: string;
      fileType: string;
      fileSize: number;
      entityType: FileEntityType;
      entityId: string;
    },
  ) {
    const storagePath = `${user.companyId}/${dto.entityType}/${randomUUID()}-${dto.fileName}`;

    const file = await this.prisma.file.create({
      data: {
        fileName: dto.fileName,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        url: '',
        storagePath,
        entityType: dto.entityType,
        entityId: dto.entityId,
        uploadedById: user.sub,
      },
    });

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUploadUrl(storagePath);
        if (!error && data?.signedUrl) {
          return { fileId: file.id, uploadUrl: data.signedUrl, storagePath, mode: 'supabase' as const };
        }
      } catch {
        // fall through to local upload
      }
    }

    const apiBase = this.config.get('API_PUBLIC_URL') || `http://localhost:${this.config.get('PORT') || 3001}`;
    return {
      fileId: file.id,
      uploadUrl: `${apiBase}/api/v1/files/upload/${file.id}`,
      storagePath,
      mode: 'local' as const,
    };
  }

  async uploadLocal(user: AuthUser, fileId: string, buffer: Buffer) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, uploadedById: user.sub },
    });
    if (!file) throw new NotFoundException('File not found');

    const dir = join(this.uploadDir, user.companyId);
    await mkdir(dir, { recursive: true });
    const filename = basename(file.storagePath);
    const diskPath = join(dir, filename);
    await writeFile(diskPath, buffer);

    const apiBase = this.config.get('API_PUBLIC_URL') || `http://localhost:${this.config.get('PORT') || 3001}`;
    const url = `${apiBase}/uploads/${user.companyId}/${filename}`;

    return this.prisma.file.update({ where: { id: fileId }, data: { url } });
  }

  async confirm(user: AuthUser, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, uploadedById: user.sub },
    });
    if (!file) throw new NotFoundException('File not found');

    if (file.url) return file;

    if (this.supabase) {
      const url = this.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(file.storagePath).data.publicUrl;
      return this.prisma.file.update({ where: { id: fileId }, data: { url } });
    }

    return file;
  }

  async getByEntity(entityType: FileEntityType, entityId: string) {
    return this.prisma.file.findMany({
      where: { entityType, entityId },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteFile(user: AuthUser, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, uploadedById: user.sub },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.removeStoredObject(file.storagePath);
    return this.prisma.file.delete({ where: { id: fileId } });
  }

  /** Delete uploads older than FILE_RETENTION_DAYS (default 30). Avatars are kept. */
  async purgeExpiredFiles(): Promise<{ deleted: number; errors: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    const expired = await this.prisma.file.findMany({
      where: {
        createdAt: { lt: cutoff },
        entityType: { not: FileEntityType.USER_AVATAR },
      },
      select: { id: true, storagePath: true, fileName: true },
    });

    if (!expired.length) {
      return { deleted: 0, errors: 0 };
    }

    let deleted = 0;
    let errors = 0;

    for (const file of expired) {
      try {
        await this.removeStoredObject(file.storagePath);
        await this.prisma.file.delete({ where: { id: file.id } });
        deleted++;
      } catch (err) {
        errors++;
        this.logger.warn(
          `Failed to purge file ${file.id} (${file.fileName}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} file(s) older than ${this.retentionDays} days`);
    }

    return { deleted, errors };
  }

  private async removeStoredObject(storagePath: string) {
    if (this.supabase) {
      const { error } = await this.supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      if (error) throw error;
      return;
    }

    const parts = storagePath.split('/');
    if (parts.length < 2) return;

    const companyId = parts[0];
    const filename = basename(storagePath);
    const diskPath = join(this.uploadDir, companyId, filename);

    try {
      await unlink(diskPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
}
