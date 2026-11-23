import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_GAP_MM,
  SCRYFALL_LANGUAGES,
  type ScryfallLanguage,
} from '@app/core';

/** multipart/form-data sends everything as strings. */
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

const toLowerCase = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateProxiesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  decklist: string;

  /** Gap between cards in mm. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_GAP_MM)
  gap?: number;

  /** Bleed in mm. Combinations that do not fit on A4 return 400. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  bleed?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  cutMarks?: boolean;

  /** Print both faces of double-faced cards (default true). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  bothFaces?: boolean;

  /**
   * Scryfall language code for the card images (default `en`). Cards not
   * printed in that language fall back to English with a warning.
   */
  @IsOptional()
  @Transform(toLowerCase)
  @IsIn(SCRYFALL_LANGUAGES)
  lang?: ScryfallLanguage;
}
