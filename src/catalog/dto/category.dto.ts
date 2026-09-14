import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Anillos' })
  name: string;

  @ApiProperty({ example: 'anillos' })
  slug: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}
