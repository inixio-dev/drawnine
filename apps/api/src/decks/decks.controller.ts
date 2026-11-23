import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ProxyService, type ParsedDecklist } from '@drawnine/core';
import { ParseDecklistDto } from './dto/parse-decklist.dto.js';

@Controller('decks')
export class DecksController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  parse(@Body() dto: ParseDecklistDto): ParsedDecklist {
    return this.proxyService.parse(dto.decklist);
  }
}
