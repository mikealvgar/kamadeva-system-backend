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
import {
  PRODUCT_IMAGES,
  type ProductImageUploader,
} from './product-images.service.js';

const productSelect = {
  id: true,
  sku: true,
  name: true,
  description: true,
  barcode: true,
  brand: true,
  tallas: true,
  cost: true,
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

  async create(dto: CreateProductDto): Promise<ProductDto> {
    await this.requireCategory(dto.categoryId);
    try {
      const product = await this.prisma.product.create({
        data: {
          sku: dto.sku.trim().toUpperCase(),
          name: dto.articulo.trim(),
          description: dto.descripcion?.trim() || null,
          barcode: dto.codigoBarras?.trim() || null,
          brand: dto.marca?.trim() || null,
          tallas: dto.tallas?.map((size) => size.trim()) ?? [],
          cost:
            dto.precioCompra == null
              ? null
              : new Prisma.Decimal(dto.precioCompra),
          price: new Prisma.Decimal(dto.precioVenta),
          categoryId: dto.categoryId,
        },
        select: productSelect,
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
    if (query.search) {
      const filter = { contains: query.search, mode: 'insensitive' } as const;
      where.OR = [{ name: filter }, { sku: filter }, { barcode: filter }];
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

  async update(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    if (Object.values(dto).every((value) => value === undefined))
      throw new BadRequestException('Debe enviar al menos un campo');
    await this.requireProduct(id);
    if (dto.categoryId !== undefined)
      await this.requireCategory(dto.categoryId);
    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim().toUpperCase();
    if (dto.articulo !== undefined) data.name = dto.articulo.trim();
    if (dto.descripcion !== undefined)
      data.description = dto.descripcion?.trim() || null;
    if (dto.codigoBarras !== undefined)
      data.barcode = dto.codigoBarras?.trim() || null;
    if (dto.marca !== undefined) data.brand = dto.marca?.trim() || null;
    if (dto.tallas !== undefined)
      data.tallas = dto.tallas.map((size) => size.trim());
    if (dto.precioCompra !== undefined)
      data.cost =
        dto.precioCompra === null ? null : new Prisma.Decimal(dto.precioCompra);
    if (dto.precioVenta !== undefined)
      data.price = new Prisma.Decimal(dto.precioVenta);
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data,
        select: productSelect,
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
      sku: product.sku,
      articulo: product.name,
      descripcion: product.description,
      codigoBarras: product.barcode,
      marca: product.brand,
      tallas: product.tallas.length ? product.tallas : null,
      precioCompra: product.cost?.toFixed(2) ?? null,
      precioVenta: product.price.toFixed(2),
      stock: stocks.get(product.id) ?? '0.000',
      imageUrl: product.imageUrl,
      isActive: product.isActive,
      categoria: product.category,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  private rethrow(error: unknown, categoryReference = false): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('El SKU o código de barras ya existe');
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
