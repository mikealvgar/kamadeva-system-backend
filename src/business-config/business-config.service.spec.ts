import { PrismaService } from '../prisma/prisma.service.js';
import { BusinessConfigService } from './business-config.service.js';
import { PHONE_PATTERN } from '../common/validation/patterns.js';
import { RFC_PATTERN } from './dto/business-config.dto.js';

describe('BusinessConfigService', () => {
  const prisma = { businessConfig: { findUnique: vi.fn(), upsert: vi.fn() } };
  const service = new BusinessConfigService(prisma as unknown as PrismaService);
  const updatedAt = new Date('2026-10-30T12:00:00Z');
  const record = {
    nombre: 'Kamadeva',
    direccion: 'Av. 1',
    colonia: 'Roma Sur',
    municipio: 'Cuauhtémoc',
    estado: 'CDMX',
    telefono: '55-1234-5678',
    rfc: 'KAM210315ABC',
    mensajePie: 'Gracias',
    fechaActualizacion: updatedAt,
  };
  const dto = {
    nombre: ' Kamadeva ',
    direccion: ' Av. 1 ',
    colonia: ' Roma Sur ',
    municipio: ' Cuauhtémoc ',
    estado: ' CDMX ',
    telefono: ' 55-1234-5678 ',
    rfc: ' kam210315abc ',
    mensajePie: ' Gracias ',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.businessConfig.upsert.mockResolvedValue(record);
  });

  it('reports a missing configuration', async () => {
    prisma.businessConfig.findUnique.mockResolvedValue(null);
    await expect(service.get()).rejects.toMatchObject({
      status: 404,
      message: 'Configuración del negocio no registrada',
    });
    expect(prisma.businessConfig.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clave: 'default' } }),
    );
  });

  it('maps stored columns to the public Spanish contract', async () => {
    prisma.businessConfig.findUnique.mockResolvedValue(record);
    expect(await service.get()).toEqual({
      nombre: 'Kamadeva',
      direccion: 'Av. 1',
      colonia: 'Roma Sur',
      municipio: 'Cuauhtémoc',
      estado: 'CDMX',
      telefono: '55-1234-5678',
      rfc: 'KAM210315ABC',
      mensajePie: 'Gracias',
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('upserts the single row with normalized values', async () => {
    await service.update(dto);
    const data = {
      nombre: 'Kamadeva',
      direccion: 'Av. 1',
      colonia: 'Roma Sur',
      municipio: 'Cuauhtémoc',
      estado: 'CDMX',
      telefono: '55-1234-5678',
      rfc: 'KAM210315ABC',
      mensajePie: 'Gracias',
    };
    expect(prisma.businessConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clave: 'default' },
        create: { clave: 'default', ...data },
        update: data,
      }),
    );
  });

  it.each([
    ['KAM210315ABC', true], // persona moral
    ['GODE561231GR8', true], // persona física
    ['XAXX010101000', true], // público en general
    ['ÑAÑ210315AB1', true],
    ['KA210315ABC', false],
    ['KAM21031ABC', false],
    ['KAM210315AB', false],
    ['kam210315abc', false],
  ])('validates RFC %s → %s', (rfc, valid) => {
    expect(RFC_PATTERN.test(rfc)).toBe(valid);
  });

  it.each([
    ['55-1234-5678', true],
    ['+52 (55) 1234.5678', true],
    ['1234567', true],
    ['123456', false],
    ['55-ABCD-5678', false],
    ['', false],
  ])('validates phone %s → %s', (phone, valid) => {
    expect(PHONE_PATTERN.test(phone)).toBe(valid);
  });
});
