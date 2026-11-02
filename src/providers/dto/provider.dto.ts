import { ApiProperty } from '@nestjs/swagger';

export class ProviderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Textiles del Norte SA de CV' }) nombre!: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty({ type: String, nullable: true }) correo!: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) email?: string | null;
  @ApiProperty({ type: String, nullable: true }) nombreContacto!: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) contacto?: string | null;
  @ApiProperty({ type: String, nullable: true }) direccion!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ required: false }) isActive?: boolean;
  @ApiProperty({ format: 'date-time' }) fechaCreacion!: string;
  @ApiProperty({ format: 'date-time' }) fechaActualizacion!: string;
  @ApiProperty({ format: 'date-time', required: false }) createdAt?: string;
  @ApiProperty({ format: 'date-time', required: false }) updatedAt?: string;
}
