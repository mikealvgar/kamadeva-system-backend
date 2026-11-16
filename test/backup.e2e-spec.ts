import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { PRODUCT_IMAGES } from '../src/catalog/products/product-images.service.js';
import type { BackupPayload } from '../src/backup/backup.types.js';

const base = '/api/respaldo';

function parseBinary(
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Backup & Restore HTTP + PostgreSQL', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService;
  const users: Record<'admin' | 'seller', string> = {} as never;
  const tokens: Record<'admin' | 'seller', string> = {} as never;
  const http = () => request(app!.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRODUCT_IMAGES)
      .useValue({ upload: vi.fn() })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const jwt = new JwtService();
    for (const [key, role] of [
      ['admin', 'ADMIN'],
      ['seller', 'VENDEDOR'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          nombre: `Backup ${key}`,
          email: `${randomUUID()}@backup.test`,
          passwordHash: 'unused-test-hash',
          rol: { connect: { nombre: role } },
        },
      });
      users[key] = user.id;
      tokens[key] =
        `Bearer ${jwt.sign({ sub: user.id, email: user.email, roles: [role] }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m', algorithm: 'HS256' })}`;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { id: { in: Object.values(users) } },
      });
    }
    await app?.close();
  });

  it('restricts export and restore to ADMIN (401/403)', async () => {
    await http().get(`${base}/exportar`).expect(401);
    await http()
      .get(`${base}/exportar`)
      .set('Authorization', tokens.seller)
      .expect(403);
    await http()
      .post(`${base}/restaurar`)
      .set('Authorization', tokens.seller)
      .expect(403);
  });

  it('exports compressed snapshot, validates preview, and restores atomically', async () => {
    const tag = randomUUID().slice(0, 8).toUpperCase();
    const product = await prisma.product.create({
      data: {
        nombre: `BackupProd-${tag}`,
        codigoBarras: `BK${tag}`,
        precioVenta: 150,
      },
    });

    const exportRes = await http()
      .get(`${base}/exportar`)
      .set('Authorization', tokens.admin)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);

    expect(exportRes.headers['content-type']).toContain('application/gzip');
    expect(exportRes.headers['content-disposition']).toMatch(
      /attachment; filename="respaldo-kamadeva-\d{4}-\d{2}-\d{2}\.json\.gz"/,
    );

    const payload = JSON.parse(
      gunzipSync(exportRes.body as Buffer).toString('utf8'),
    ) as BackupPayload;
    expect(payload.version).toBe('1.0.0');
    expect(payload.datos.productos.some((p) => p.id === product.id)).toBe(true);

    // Vista previa sin modificar datos
    await http()
      .post(`${base}/restaurar`)
      .set('Authorization', tokens.admin)
      .field('vistaPrevia', 'true')
      .attach('file', exportRes.body as Buffer, 'respaldo.json.gz')
      .expect(200)
      .expect((res) => {
        expect(res.body.vistaPrevia).toBe(true);
        expect(res.body.restaurado).toBe(false);
      });

    // Sin confirmarReemplazo=true debe rechazar con 400
    await http()
      .post(`${base}/restaurar`)
      .set('Authorization', tokens.admin)
      .attach('file', exportRes.body as Buffer, 'respaldo.json.gz')
      .expect(400);

    // Eliminar el producto temporal y restaurar desde el respaldo
    await prisma.product.delete({ where: { id: product.id } });
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toBeNull();

    await http()
      .post(`${base}/restaurar`)
      .set('Authorization', tokens.admin)
      .field('confirmarReemplazo', 'true')
      .attach('file', exportRes.body as Buffer, 'respaldo.json.gz')
      .expect(200)
      .expect((res) => {
        expect(res.body.vistaPrevia).toBe(false);
        expect(res.body.restaurado).toBe(true);
      });

    const restored = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(restored?.codigoBarras).toBe(`BK${tag}`);

    await prisma.product.delete({ where: { id: product.id } });
  });
});
