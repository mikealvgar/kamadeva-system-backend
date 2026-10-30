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
  name: true,
  description: true,
  barcode: true,
  brand: true,
  sizes: {
    orderBy: [{ size: { sortOrder: 'asc' } }, { size: { name: 'asc' } }],
    select: { size: { select: { id: true, name: true } } },
  },
  cost: true,
  minStock: true,
  price: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;
type ProductRecord = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_IMAGES) private readonly images: ProductImageUploader,
  ) {}

  async create(dto: CreateProductDto, actorId: string): Promise<ProductDto> {
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    await this.requireActiveSizes(dto.tallaIds);
    try {
      const data = {
        name: dto.articulo.trim(),
        description: dto.descripcion?.trim() || null,
        barcode: dto.codigoBarras.trim().toUpperCase(),
        brand: dto.marca?.trim() || null,
        sizes: {
          create: (dto.tallaIds ?? []).map((sizeId) => ({ sizeId })),
        },
        cost:
          dto.precioCompra == null
            ? null
            : new Prisma.Decimal(dto.precioCompra),
        price: new Prisma.Decimal(dto.precioVenta),
        minStock:
          dto.stockMinimo == null ? null : new Prisma.Decimal(dto.stockMinimo),
        categoryId: dto.categoryId ?? null,
      } satisfies Prisma.ProductUncheckedCreateInput;
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
              created.cost,
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
    if (query.includeInactive !== 'true') where.isActive = true;
    if (query.categoryId) where.categoryId = query.categoryId;
    else if (query.sinCategoria === 'true') where.categoryId = null;
    if (query.search) {
      const filter = { contains: query.search, mode: 'insensitive' } as const;
      where.OR = [{ name: filter }, { barcode: filter }];
    }
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
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
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        quantityChange: true,
        unitCost: true,
        referenceType: true,
        referenceId: true,
        notes: true,
        createdAt: true,
      },
    });
    return movements.map((movement) => ({
      ...movement,
      quantityChange: movement.quantityChange.toFixed(3),
      unitCost: movement.unitCost?.toFixed(2) ?? null,
      createdAt: movement.createdAt.toISOString(),
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
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    await this.requireActiveSizes(dto.tallaIds);
    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.articulo !== undefined) data.name = dto.articulo.trim();
    if (dto.descripcion !== undefined)
      data.description = dto.descripcion?.trim() || null;
    if (dto.codigoBarras !== undefined)
      data.barcode = dto.codigoBarras.trim().toUpperCase();
    if (dto.marca !== undefined) data.brand = dto.marca?.trim() || null;
    if (dto.tallaIds !== undefined)
      data.sizes = {
        deleteMany: {},
        create: dto.tallaIds.map((sizeId) => ({ sizeId })),
      };
    if (dto.precioCompra !== undefined)
      data.cost =
        dto.precioCompra === null ? null : new Prisma.Decimal(dto.precioCompra);
    if (dto.precioVenta !== undefined)
      data.price = new Prisma.Decimal(dto.precioVenta);
    if (dto.stockMinimo !== undefined)
      data.minStock =
        dto.stockMinimo === null ? null : new Prisma.Decimal(dto.stockMinimo);
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
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
                where: { productId: id },
                _sum: { quantityChange: true },
              });
              const currentStock =
                aggregate._sum.quantityChange ?? new Prisma.Decimal(0);
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
                  updated.cost,
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
      // Required quote, sale and movement relations use database RESTRICT, including races.
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

  private async requireActiveSizes(ids: string[] | undefined): Promise<void> {
    if (!ids?.length) return;
    const count = await this.prisma.size.count({
      where: { id: { in: ids }, isActive: true },
    });
    if (count !== ids.length)
      throw new BadRequestException('Talla inexistente o inactiva');
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
      by: ['productId'],
      where: { productId: { in: products.map(({ id }) => id) } },
      _sum: { quantityChange: true },
    });
    const stocks = new Map(
      totals.map((total) => [
        total.productId,
        total._sum.quantityChange?.toFixed(3) ?? '0.000',
      ]),
    );
    return products.map((product) => ({
      id: product.id,
      articulo: product.name,
      descripcion: product.description,
      codigoBarras: product.barcode,
      marca: product.brand,
      tallas: product.sizes.map(({ size }) => size),
      precioCompra: product.cost?.toFixed(2) ?? null,
      precioVenta: product.price.toFixed(2),
      stock: stocks.get(product.id) ?? '0.000',
      stockMinimo: product.minStock?.toFixed(3) ?? null,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      categoria: product.category,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  private async writeStockMovement(
    tx: Prisma.TransactionClient,
    productId: string,
    quantityChange: Prisma.Decimal,
    actorId: string,
    referenceType: string,
    unitCost: Prisma.Decimal | null,
    notes: string,
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        productId,
        type: quantityChange.isNegative() ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
        quantityChange,
        unitCost,
        referenceType,
        referenceId: productId,
        createdById: actorId,
        notes,
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
        // A size deleted between validation and write.
        if (
          categoryReference &&
          JSON.stringify(error.meta ?? {}).includes('size')
        )
          throw new BadRequestException('Talla inexistente o inactiva');
        if (categoryReference)
          throw new NotFoundException('Categoría inexistente');
        throw new ConflictException('El producto tiene registros asociados');
      }
    }
    throw error;
  }
}
