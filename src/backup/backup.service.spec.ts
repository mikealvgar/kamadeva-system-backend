import { BadRequestException } from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  compressBackup,
  parseBackupFile,
  sortCashClosuresChain,
} from './backup.serializer.js';
import { BackupService } from './backup.service.js';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLE_KEYS,
  type BackupData,
  type BackupPayload,
} from './backup.types.js';

function emptyData(): BackupData {
  return {
    roles: [{ id: 'role-admin', nombre: 'ADMIN', descripcion: 'Admin', activo: true }],
    usuarios: [
      {
        id: 'user-admin',
        nombre: 'Admin',
        email: 'admin@test.com',
        passwordHash: 'hash',
        rolId: 'role-admin',
        activo: true,
      },
    ],
    configuracionNegocio: [],
    categorias: [],
    marcas: [],
    tallas: [],
    categoriasGastos: [],
    clientes: [],
    proveedores: [],
    productos: [],
    cortesCaja: [],
    ajustesCorteCaja: [],
    compras: [],
    renglonesCompra: [],
    cotizaciones: [],
    renglonesCotizacion: [],
    ventas: [],
    renglonesVenta: [],
    movimientosInventario: [],
    gastos: [],
  };
}

function makePayload(overrides: Partial<BackupData> = {}): BackupPayload {
  const datos = { ...emptyData(), ...overrides };
  return {
    version: BACKUP_FORMAT_VERSION,
    fechaExportacion: '2026-11-15T18:00:00.000Z',
    conteos: Object.fromEntries(
      BACKUP_TABLE_KEYS.map((k) => [k, datos[k].length]),
    ) as BackupPayload['conteos'],
    datos,
  };
}

describe('BackupService & serializer', () => {
  it('sorts cash closures topologically and rejects cycles', () => {
    const c1 = { id: 'c1', corteAnteriorId: null } as never;
    const c2 = { id: 'c2', corteAnteriorId: 'c1' } as never;
    const c3 = { id: 'c3', corteAnteriorId: 'c2' } as never;

    const sorted = sortCashClosuresChain([c3, c1, c2]);
    expect(sorted.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);

    expect(() =>
      sortCashClosuresChain([
        { id: 'a', corteAnteriorId: 'b' } as never,
        { id: 'b', corteAnteriorId: 'a' } as never,
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects backups with wrong version, corrupted bytes, or no active ADMIN', () => {
    expect(() => parseBackupFile(Buffer.from('not-json'))).toThrow(
      BadRequestException,
    );

    const wrongVersion = compressBackup({
      ...makePayload(),
      version: '0.0.1',
    });
    expect(() => parseBackupFile(wrongVersion)).toThrow(BadRequestException);

    const noActiveAdmin = compressBackup(
      makePayload({
        usuarios: [
          {
            id: 'user-admin',
            nombre: 'Admin',
            email: 'admin@test.com',
            passwordHash: 'hash',
            rolId: 'role-admin',
            activo: false,
          },
        ],
      }),
    );
    expect(() => parseBackupFile(noActiveAdmin)).toThrow(BadRequestException);
  });

  it('exports gzipped snapshot excluding ephemeral tables and supports dryRun preview', async () => {
    const mockPrisma = {
      role: { findMany: vi.fn().mockResolvedValue(emptyData().roles) },
      user: { findMany: vi.fn().mockResolvedValue(emptyData().usuarios) },
      businessConfig: { findMany: vi.fn().mockResolvedValue([]) },
      category: { findMany: vi.fn().mockResolvedValue([]) },
      brand: { findMany: vi.fn().mockResolvedValue([]) },
      size: { findMany: vi.fn().mockResolvedValue([]) },
      expenseCategory: { findMany: vi.fn().mockResolvedValue([]) },
      customer: { findMany: vi.fn().mockResolvedValue([]) },
      provider: { findMany: vi.fn().mockResolvedValue([]) },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      cashClosure: { findMany: vi.fn().mockResolvedValue([]) },
      cashClosureAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
      purchase: { findMany: vi.fn().mockResolvedValue([]) },
      purchaseItem: { findMany: vi.fn().mockResolvedValue([]) },
      quote: { findMany: vi.fn().mockResolvedValue([]) },
      quoteItem: { findMany: vi.fn().mockResolvedValue([]) },
      sale: { findMany: vi.fn().mockResolvedValue([]) },
      saleItem: { findMany: vi.fn().mockResolvedValue([]) },
      inventoryMovement: { findMany: vi.fn().mockResolvedValue([]) },
      expense: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new BackupService(mockPrisma);
    const { buffer, filename } = await service.exportBackup();

    expect(filename).toMatch(/^respaldo-kamadeva-\d{4}-\d{2}-\d{2}\.json\.gz$/);
    const json = JSON.parse(gunzipSync(buffer).toString('utf8')) as BackupPayload;
    expect(json.version).toBe(BACKUP_FORMAT_VERSION);
    expect(json.conteos.roles).toBe(1);
    expect(json.conteos.usuarios).toBe(1);
    expect(Object.keys(json.datos)).not.toContain('refreshToken');
    expect(Object.keys(json.datos)).not.toContain('idempotencyKey');

    const preview = await service.restoreBackup(buffer, { vistaPrevia: 'true' });
    expect(preview.vistaPrevia).toBe(true);
    expect(preview.restaurado).toBe(false);
    expect(preview.conteos.usuarios).toBe(1);

    await expect(
      service.restoreBackup(buffer, { vistaPrevia: 'false' }),
    ).rejects.toThrow(BadRequestException);
  });
});
