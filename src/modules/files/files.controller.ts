import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { FileEntityType } from '@prisma/client';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('presign')
  presign(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.filesService.presign(user, dto);
  }

  @Post('upload/:fileId')
  @UseInterceptors(FileInterceptor('file'))
  uploadLocal(
    @CurrentUser() user: AuthUser,
    @Param('fileId') fileId: string,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file?.buffer) throw new BadRequestException('File is required');
    return this.filesService.uploadLocal(user, fileId, file.buffer);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.filesService.confirm(user, id);
  }

  @Get()
  getByEntity(@Query('entityType') entityType: FileEntityType, @Query('entityId') entityId: string) {
    return this.filesService.getByEntity(entityType, entityId);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.filesService.deleteFile(user, id);
  }
}
