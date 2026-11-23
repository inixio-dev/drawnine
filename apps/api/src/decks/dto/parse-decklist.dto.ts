import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ParseDecklistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  decklist: string;
}
