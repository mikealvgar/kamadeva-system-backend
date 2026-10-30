import { ApiProperty } from '@nestjs/swagger';

export class ProviderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Textiles del Norte SA de CV' }) nombre: string;
  @ApiProperty({ type: String, nullable: true }) telefono: string | null;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) contacto: string | null;
  @ApiProperty({ type: String, nullable: true }) direccion: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
