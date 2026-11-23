import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyService } from '@app/core';
import { DecksController } from '../../src/decks/decks.controller.js';

describe('DecksController', () => {
  let controller: DecksController;
  const proxyService = { parse: vi.fn() };

  beforeEach(async () => {
    proxyService.parse.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [DecksController],
      providers: [{ provide: ProxyService, useValue: proxyService }],
    }).compile();
    controller = moduleRef.get(DecksController);
  });

  it('delegates parsing to ProxyService', () => {
    const parsed = { entries: [], errors: [] };
    proxyService.parse.mockReturnValue(parsed);

    expect(controller.parse({ decklist: '4 Lightning Bolt' })).toBe(parsed);
    expect(proxyService.parse).toHaveBeenCalledWith('4 Lightning Bolt');
  });
});
