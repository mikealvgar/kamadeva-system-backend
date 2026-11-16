import { BadRequestException } from '@nestjs/common';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLE_KEYS,
  type BackupCounts,
  type BackupData,
  type BackupPayload,
} from './backup.types.js';

export function computeBackupCounts(datos: BackupData): BackupCounts {
  return {
    roles: datos.roles.length,
    usuarios: datos.usuarios.length,
    configuracionNegocio: datos.configuracionNegocio.length,
    categorias: datos.categorias.length,
    marcas: datos.marcas.length,
    tallas: datos.tallas.length,
    categoriasGastos: datos.categoriasGastos.length,
    clientes: datos.clientes.length,
    proveedores: datos.proveedores.length,
    productos: datos.productos.length,
    cortesCaja: datos.cortesCaja.length,
    ajustesCorteCaja: datos.ajustesCorteCaja.length,
    compras: datos.compras.length,
    renglonesCompra: datos.renglonesCompra.length,
    cotizaciones: datos.cotizaciones.length,
    renglonesCotizacion: datos.renglonesCotizacion.length,
    ventas: datos.ventas.length,
    renglonesVenta: datos.renglonesVenta.length,
    movimientosInventario: datos.movimientosInventario.length,
    gastos: datos.gastos.length,
  };
}

export function compressBackup(payload: BackupPayload): Buffer {
  const json = JSON.stringify(payload);
  return gzipSync(Buffer.from(json, 'utf8'));
}

export function sortCashClosuresChain(
  closures: Prisma.CashClosureCreateManyInput[],
): Prisma.CashClosureCreateManyInput[] {
  if (closures.length <= 1) return [...closures];

  const byId = new Map<string, Prisma.CashClosureCreateManyInput>();
  const childrenByParent = new Map<
    string | null,
    Prisma.CashClosureCreateManyInput[]
  >();

  for (const closure of closures) {
    if (!closure.id) {
      throw new BadRequestException(
        'Cada corte de caja en el respaldo debe incluir su id',
      );
    }
    byId.set(closure.id, closure);
    const parentId = closure.corteAnteriorId ?? null;
    const group = childrenByParent.get(parentId) ?? [];
    group.push(closure);
    childrenByParent.set(parentId, group);
  }

  for (const closure of closures) {
    if (closure.corteAnteriorId && !byId.has(closure.corteAnteriorId)) {
      throw new BadRequestException(
        `Corte de caja ${closure.id} referencia un corteAnteriorId inexistente (${closure.corteAnteriorId})`,
      );
    }
  }

  const ordered: Prisma.CashClosureCreateManyInput[] = [];
  const queue = [...(childrenByParent.get(null) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    const next = childrenByParent.get(current.id!) ?? [];
    queue.push(...next);
  }

  if (ordered.length !== closures.length) {
    throw new BadRequestException(
      'La cadena de cortes de caja contiene ciclos o referencias inválidas',
    );
  }

  return ordered;
}

export function parseBackupFile(buffer: Buffer): BackupPayload {
  if (buffer.length === 0) {
    throw new BadRequestException('El archivo de respaldo está vacío');
  }

  let rawText: string;
  try {
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    const plain = isGzip ? gunzipSync(buffer) : buffer;
    rawText = plain.toString('utf8');
  } catch {
    throw new BadRequestException(
      'No se pudo descomprimir el archivo de respaldo (.json.gz inválido)',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new BadRequestException('El contenido del respaldo no es JSON válido');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BadRequestException('Estructura de respaldo inválida');
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== BACKUP_FORMAT_VERSION) {
    throw new BadRequestException(
      `Versión de respaldo incompatible: se esperaba ${BACKUP_FORMAT_VERSION}`,
    );
  }
  if (typeof record.fechaExportacion !== 'string' || !record.fechaExportacion) {
    throw new BadRequestException(
      'El respaldo debe incluir una fechaExportacion válida',
    );
  }
  if (!record.datos || typeof record.datos !== 'object') {
    throw new BadRequestException('El respaldo no contiene el objeto datos');
  }

  const datosRecord = record.datos as Record<string, unknown>;
  for (const key of BACKUP_TABLE_KEYS) {
    if (!Array.isArray(datosRecord[key])) {
      throw new BadRequestException(
        `Falta la colección obligatoria "${key}" en el respaldo`,
      );
    }
  }

  const datos = datosRecord as unknown as BackupData;
  validateActiveAdmin(datos);
  const sortedClosures = sortCashClosuresChain(datos.cortesCaja);

  const normalizedDatos: BackupData = {
    ...datos,
    cortesCaja: sortedClosures,
  };

  return {
    version: record.version,
    fechaExportacion: record.fechaExportacion,
    conteos: computeBackupCounts(normalizedDatos),
    datos: normalizedDatos,
  };
}

function validateActiveAdmin(datos: BackupData): void {
  const adminRole = datos.roles.find((role) => role.nombre === 'ADMIN');
  if (!adminRole?.id) {
    throw new BadRequestException(
      'El respaldo debe incluir el rol ADMIN para permitir acceso administrativo',
    );
  }

  const hasActiveAdmin = datos.usuarios.some(
    (user) => user.rolId === adminRole.id && user.activo !== false,
  );
  if (!hasActiveAdmin) {
    throw new BadRequestException(
      'El respaldo debe incluir al menos un usuario ADMIN activo',
    );
  }
}
