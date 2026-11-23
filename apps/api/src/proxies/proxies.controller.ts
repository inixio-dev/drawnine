import {
  Body,
  Controller,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ProxyService } from '@app/core';
import { CreateProxiesDto } from './dto/create-proxies.dto.js';

/**
 * Multer limit; the configured zip limits are enforced again by core.
 * ART_ZIP_MAX_COMPRESSED_BYTES=0 disables it (undefined = no multer limit).
 */
const MAX_ART_UPLOAD_BYTES = maxArtUploadBytes(
  process.env.ART_ZIP_MAX_COMPRESSED_BYTES,
);

function maxArtUploadBytes(raw: string | undefined): number | undefined {
  if (raw !== undefined && raw.trim() !== '' && Number(raw) === 0) {
    return undefined;
  }
  return Number(raw) || 50 * 1024 * 1024;
}

@Controller('proxies')
export class ProxiesController {
  constructor(private readonly proxyService: ProxyService) {}

  /** Generates a printable PDF of proxies for personal playtesting only. */
  @Post()
  @UseInterceptors(
    FileInterceptor('art', {
      limits: { fileSize: MAX_ART_UPLOAD_BYTES, files: 1 },
    }),
  )
  async create(
    @Body() dto: CreateProxiesDto,
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() art?: Express.Multer.File,
  ): Promise<StreamableFile> {
    const result = await this.proxyService.generate({
      decklist: dto.decklist,
      art: art ? new Uint8Array(art.buffer) : undefined,
      options: {
        ...(dto.gap !== undefined && { gapMm: dto.gap }),
        ...(dto.bleed !== undefined && { bleedMm: dto.bleed }),
        ...(dto.cutMarks !== undefined && { cutMarks: dto.cutMarks }),
        ...(dto.bothFaces !== undefined && { printBothFaces: dto.bothFaces }),
        ...(dto.lang !== undefined && { lang: dto.lang }),
      },
    });
    res.setHeader('X-DrawNine-Pages', String(result.pageCount));
    res.setHeader('X-DrawNine-Cards', String(result.cardCount));
    if (result.warnings.length > 0) {
      // Header values must be ASCII: send the warnings URI-encoded as JSON.
      res.setHeader(
        'X-DrawNine-Warnings',
        encodeURIComponent(JSON.stringify(result.warnings)),
      );
    }
    return new StreamableFile(result.pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="drawnine-proxies.pdf"',
    });
  }
}
