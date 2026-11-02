import { ApiProperty } from '@nestjs/swagger';

export class CustomerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ana Pérez' }) nombre!: string;
  @ApiProperty({ example: 'Ana Pérez', required: false }) name?: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) phone?: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'email' }) correo!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'email', required: false }) email?: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ required: false }) isActive?: boolean;
  @ApiProperty({ required: false }) esPredeterminado?: boolean;
  @ApiProperty({ format: 'date-time' }) fechaCreacion!: string;
  @ApiProperty({ format: 'date-time' }) fechaActualizacion!: string;
  @ApiProperty({ format: 'date-time', required: false }) createdAt?: string;
  @ApiProperty({ format: 'date-time', required: false }) updatedAt?: string;
}
