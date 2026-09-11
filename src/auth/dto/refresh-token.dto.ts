import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: '<refresh-token>', maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}
