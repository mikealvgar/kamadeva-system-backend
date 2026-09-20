import { ApiProperty } from '@nestjs/swagger';

export class CustomerDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Ana Pérez' }) name: string;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'email' }) email:
    string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
