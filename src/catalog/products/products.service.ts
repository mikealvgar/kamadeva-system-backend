import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { ListProductsDto } from './dto/list-products.dto.js';
import type { ProductDto } from './dto/product.dto.js';
import type { InventoryMovementDto } from './dto/inventory-movement.dto.js';
import { serializableTransaction } from '../../prisma/serializable-transaction.js';
import {
  PRODUCT_IMAGES,
  type ProductImageUploader,
} from './product-images.service.js';

const productSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  codigoBarras: true,
  marcaId: true,
  marca: { select: { id: true, descripcion: true } },
  precioCompra: true,
  existenciaMinima: true,
  precioVenta: true,
  imageUrl: true,
  activo: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  categoriaId: true,
  categoria: { select: { id: true, descripcion: true } },
} satisfies Prisma.ProductSelect;
type ProductRecord = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_IMAGES) private readonly images: ProductImageUploader,
  ) {}

  async create(dto: CreateProductDto, actorId: string): Promise<ProductDto> {
    const categoryId = dto.categoriaId ?? dto.categoryId;
    if (categoryId) await this.requireCategory(categoryId);

    let marcaId = dto.marcaId;
    if (!marcaId && dto.marca) {
      const brandName = dto.marca.trim().toUpperCase();
      const brand = await this.prisma.brand.findUnique({
        where: { descripcion: brandName },
      });
      if (brand) {
        marcaId = brand.id;
      } else {
        const createdBrand = await this.prisma.brand.create({
          data: { descripcion: brandName },
        });
        marcaId = createdBrand.id;
      }
    }

    try {
      const nombre = (dto.nombre ?? dto.articulo ?? '').trim();
      if (!nombre) {
        throw new BadRequestException('El nombre o artículo es obligatorio');
      }

      const data: Prisma.ProductUncheckedCreateInput = {
        nombre,
        descripcion: (dto.descripcion ?? dto.description)?.trim() || null,
        codigoBarras: dto.codigoBarras.trim().toUpperCase(),
        marcaId: marcaId ?? null,
        precioCompra:
          dto.precioCompra == null
            ? null
            : new Prisma.Decimal(dto.precioCompra),
        precioVenta: new Prisma.Decimal(dto.precioVenta),
        existenciaMinima:
          dto.existenciaMinima != null
            ? new Prisma.Decimal(dto.existenciaMinima)
            : dto.stockMinimo != null
              ? new Prisma.Decimal(dto.stockMinimo)
              : null,
        categoriaId: categoryId ?? null,
        activo: dto.activo ?? dto.isActive ?? true,
      };

      const initialStock = new Prisma.Decimal(dto.stock ?? 0);
      const product = initialStock.isZero()
        ? await this.prisma.product.create({ data, select: productSelect })
        : await serializableTransaction(this.prisma, async (tx) => {
            const created = await tx.product.create({
              data,
              select: productSelect,
            });
            await this.writeStockMovement(
              tx,
              created.id,
              initialStock,
              actorId,
              'PRODUCT_INITIAL_STOCK',
              created.precioCompra,
              'Existencia inicial al registrar producto',
            );
            return created;
          });
      return (await this.withStock([product]))[0]!;
    } catch (error) {
      this.rethrow(error, true);
    }
  }

  async findAll(query: ListProductsDto = {}): Promise<ProductDto[]> {
    const where: Prisma.ProductWhereInput = {};
    if (query.includeInactive !== 'true') where.activo = true;
    const catId = query.categoryId;
    if (catId) where.categoriaId = catId;
    else if (query.sinCategoria === 'true') where.categoriaId = null;
    if (query.search) {
      const filter = { contains: query.search, mode: 'insensitive' } as const;
      where.OR = [{ nombre: filter }, { codigoBarras: filter }];
    }
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { nombre: 'asc' },
      select: productSelect,
    });
    return this.withStock(products);
  }

  async findById(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: productSelect,
    });
    if (!product) throw new NotFoundException('Producto inexistente');
    return (await this.withStock([product]))[0]!;
  }

  async movements(id: string): Promise<InventoryMovementDto[]> {
    await this.requireProduct(id);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { productoId: id },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        tipo: true,
        cambioExistencias: true,
        costoUnitario: true,
        tipoReferencia: true,
        referenciaId: true,
        notas: true,
        fechaCreacion: true,
      },
    });
    return movements.map((movement) => ({
      id: movement.id,
      type: movement.tipo,
      quantityChange: movement.cambioExistencias.toFixed(3),
      unitCost: movement.costoUnitario?.toFixed(2) ?? null,
      referenceType: movement.tipoReferencia,
      referenceId: movement.referenciaId,
      notes: movement.notas,
      createdAt: movement.fechaCreacion.toISOString(),
    }));
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actorId: string,
  ): Promise<ProductDto> {
    if (Object.values(dto).every((value) => value === undefined))
      throw new BadRequestException('Debe enviar al menos un campo');
    await this.requireProduct(id);
    const categoryId = dto.categoriaId ?? dto.categoryId;
    if (categoryId) await this.requireCategory(categoryId);

    const data: Prisma.ProductUncheckedUpdateInput = {};
    const nombre = dto.nombre !== undefined ? dto.nombre : dto.articulo;
    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || !nombre.trim()) {
        throw new BadRequestException('El nombre o artículo es obligatorio');
      }
      data.nombre = nombre.trim();
    }
    const desc = dto.descripcion !== undefined ? dto.descripcion : dto.description;
    if (desc !== undefined) data.descripcion = desc?.trim() || null;
    if (dto.codigoBarras !== undefined) {
      if (typeof dto.codigoBarras !== 'string' || !dto.codigoBarras.trim()) {
        throw new BadRequestException('El código de barras es obligatorio');
      }
      data.codigoBarras = dto.codigoBarras.trim().toUpperCase();
    }

    if (dto.marcaId !== undefined) {
      data.marcaId = dto.marcaId;
    } else if (dto.marca !== undefined) {
      if (dto.marca && dto.marca.trim()) {
        const brandName = dto.marca.trim().toUpperCase();
        const brand = await this.prisma.brand.findUnique({
          where: { descripcion: brandName },
        });
        if (brand) {
          data.marcaId = brand.id;
        } else {
          const createdBrand = await this.prisma.brand.create({
            data: { descripcion: brandName },
          });
          data.marcaId = createdBrand.id;
        }
      } else {
        data.marcaId = null;
      }
    }

    if (dto.precioCompra !== undefined)
      data.precioCompra =
        dto.precioCompra === null ? null : new Prisma.Decimal(dto.precioCompra);
    if (dto.precioVenta !== undefined) {
      if (dto.precioVenta === null || typeof dto.precioVenta !== 'number') {
        throw new BadRequestException('El precio de venta es obligatorio');
      }
      data.precioVenta = new Prisma.Decimal(dto.precioVenta);
    }
    const minStock = dto.existenciaMinima ?? dto.stockMinimo;
    if (minStock !== undefined)
      data.existenciaMinima =
        minStock === null ? null : new Prisma.Decimal(minStock);
    if (categoryId !== undefined) data.categoriaId = categoryId;
    const activo = dto.activo ?? dto.isActive;
    if (activo !== undefined) data.activo = activo;

    const targetStock = dto.stock;
    try {
      const product =
        targetStock === undefined
          ? await this.prisma.product.update({
              where: { id },
              data,
              select: productSelect,
            })
          : await serializableTransaction(this.prisma, async (tx) => {
              const existing = await tx.product.findUnique({
                where: { id },
                select: { id: true },
              });
              if (!existing)
                throw new NotFoundException('Producto inexistente');
              const aggregate = await tx.inventoryMovement.aggregate({
                where: { productoId: id },
                _sum: { cambioExistencias: true },
              });
              const currentStock =
                aggregate._sum.cambioExistencias ?? new Prisma.Decimal(0);
              const delta = new Prisma.Decimal(targetStock).minus(currentStock);
              const updated = await tx.product.update({
                where: { id },
                data,
                select: productSelect,
              });
              if (!delta.isZero())
                await this.writeStockMovement(
                  tx,
                  id,
                  delta,
                  actorId,
                  'PRODUCT_STOCK_EDIT',
                  updated.precioCompra,
                  'Existencia actualizada desde producto',
                );
              return updated;
            });
      return (await this.withStock([product]))[0]!;
    } catch (error) {
      this.rethrow(error, true);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async uploadImage(
    id: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<ProductDto> {
    await this.requireProduct(id);
    const imageUrl = await this.images.upload(id, buffer, mimetype);
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: { imageUrl },
        select: productSelect,
      });
      return (await this.withStock([product]))[0]!;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private async requireCategory(id: string): Promise<void> {
    if (
      !(await this.prisma.category.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Categoría inexistente');
  }

  private async requireProduct(id: string): Promise<void> {
    if (
      !(await this.prisma.product.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Producto inexistente');
  }

  private async withStock(products: ProductRecord[]): Promise<ProductDto[]> {
    if (products.length === 0) return [];
    const totals = await this.prisma.inventoryMovement.groupBy({
      by: ['productoId'],
      where: { productoId: { in: products.map(({ id }) => id) } },
      _sum: { cambioExistencias: true },
    });
    const stocks = new Map(
      totals.map((total) => [
        total.productoId,
        total._sum.cambioExistencias?.toFixed(3) ?? '0.000',
      ]),
    );
    return products.map((product) => ({
      id: product.id,
      nombre: product.nombre,
      articulo: product.nombre,
      name: product.nombre,
      descripcion: product.descripcion,
      description: product.descripcion,
      codigoBarras: product.codigoBarras,
      barcode: product.codigoBarras,
      marca: product.marca,
      brand: product.marca?.descripcion ?? null,
      marcaId: product.marcaId,
      tallas: [],
      precioCompra: product.precioCompra?.toFixed(2) ?? null,
      precioVenta: product.precioVenta.toFixed(2),
      stock: stocks.get(product.id) ?? '0.000',
      existenciaMinima: product.existenciaMinima?.toFixed(3) ?? null,
      stockMinimo: product.existenciaMinima?.toFixed(3) ?? null,
      imageUrl: product.imageUrl,
      activo: product.activo,
      isActive: product.activo,
      categoria: product.categoria,
      categoriaId: product.categoriaId,
      fechaCreacion: product.fechaCreacion.toISOString(),
      fechaActualizacion: product.fechaActualizacion.toISOString(),
      createdAt: product.fechaCreacion.toISOString(),
      updatedAt: product.fechaActualizacion.toISOString(),
    }));
  }

  private async writeStockMovement(
    tx: Prisma.TransactionClient,
    productoId: string,
    cambioExistencias: Prisma.Decimal,
    actorId: string,
    tipoReferencia: string,
    costoUnitario: Prisma.Decimal | null,
    notas: string,
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        productoId,
        tipo: cambioExistencias.isNegative() ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
        cambioExistencias,
        costoUnitario,
        tipoReferencia,
        referenciaId: productoId,
        creadoPorId: actorId,
        notas,
      },
    });
  }

  private rethrow(error: unknown, categoryReference = false): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('El código de barras ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Producto inexistente');
      if (error.code === 'P2003') {
        if (categoryReference)
          throw new NotFoundException('Categoría inexistente');
        throw new ConflictException('El producto tiene registros asociados');
      }
    }
    throw error;
  }
}
