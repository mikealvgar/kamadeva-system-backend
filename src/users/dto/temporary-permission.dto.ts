import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export interface TemporaryPermissionItem {
  permission: string;
  expiresAt: string;
  grantedBy?: string;
  reason?: string;
}

export class TemporaryPermissionDto implements TemporaryPermissionItem {
  @ApiProperty({ example: 'products.deactivate', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  permission!: string;

  @ApiProperty({ example: '2026-11-16T22:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  expiresAt!: string;

  @ApiPropertyOptional({ example: 'admin_id', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  grantedBy?: string;

  @ApiPropertyOptional({ example: 'Apoyo en inventario', maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;
}

/** Normaliza lista de permisos permanentes evitando vacíos y duplicados. */
export function normalizeAllowedSections(raw?: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed) unique.add(trimmed);
  }
  return [...unique];
}

/** Normaliza la lista JSON de permisos temporales persistida en Prisma. */
export function normalizeTemporaryPermissions(
  raw: unknown,
): TemporaryPermissionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: TemporaryPermissionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.permission !== 'string' ||
      !record.permission.trim() ||
      typeof record.expiresAt !== 'string' ||
      !record.expiresAt.trim()
    ) {
      continue;
    }
    const normalized: TemporaryPermissionItem = {
      permission: record.permission.trim(),
      expiresAt: record.expiresAt.trim(),
    };
    if (typeof record.grantedBy === 'string' && record.grantedBy.trim()) {
      normalized.grantedBy = record.grantedBy.trim();
    }
    if (typeof record.reason === 'string' && record.reason.trim()) {
      normalized.reason = record.reason.trim();
    }
    items.push(normalized);
  }
  return items;
}
