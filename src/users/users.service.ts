import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import { isRoleName, type RoleName } from '../roles/role-names.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { UserListPageDto } from './dto/user-list.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserRoles(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await this.requireUser(userId, tx);
    const rolNombre = user.rol?.activo && isRoleName(user.rol.nombre) ? user.rol.nombre : '';
    return {
      usuarioId: userId,
      roles: rolNombre ? [rolNombre] : [],
    };
  }

  async setUserRoles(userId: string, roles: RoleName[]) {
    if (
      !Array.isArray(roles) ||
      !roles.length ||
      roles.length > 2 ||
      new Set(roles).size !== roles.length ||
      !roles.every(isRoleName)
    ) {
      throw new BadRequestException('Roles inválidos');
    }
    const targetRoleName = roles.includes('ADMIN') ? 'ADMIN' : roles[0];
    return serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      const allRoles = await tx.role.findMany({
        where: { nombre: { in: roles } },
      });
      if (allRoles.some((r) => !r.activo)) {
        throw new UnprocessableEntityException('Rol inactivo');
      }
      const resolved = await tx.role.findUnique({
        where: { nombre: targetRoleName },
      });
      if (!resolved)
        throw new InternalServerErrorException('Roles no configurados');
      if (!resolved.activo)
        throw new UnprocessableEntityException('Rol inactivo');
      if (!roles.includes('ADMIN')) await this.protectLastAdmin(user, tx);
      await tx.user.update({
        where: { id: userId },
        data: { rolId: resolved.id },
      });
      return this.getUserRoles(userId, tx);
    });
  }

  async removeUserRole(userId: string, roleName: RoleName): Promise<void> {
    if (!isRoleName(roleName)) throw new BadRequestException('Rol inválido');
    await serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      if (roleName === 'ADMIN') await this.protectLastAdmin(user, tx);
      if (user.rol?.nombre === roleName) {
        await tx.user.update({
          where: { id: userId },
          data: { rolId: null },
        });
      }
    });
  }

  async deleteUser(userId: string, requesterId: string): Promise<void> {
    if (userId === requesterId)
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    await serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      if (
        user.activo &&
        user.rol?.nombre === 'ADMIN' &&
        user.rol?.activo &&
        (await this.countActiveAdmins(tx)) <= 1
      ) {
        throw new ConflictException(
          'No se puede eliminar el último administrador',
        );
      }
      // Auditoría: si tiene registros asociados no se elimina físicamente
      const counts = await Promise.all([
        tx.quote.count({ where: { creadoPorId: userId } }),
        tx.sale.count({ where: { creadoPorId: userId } }),
        tx.sale.count({ where: { canceladoPorId: userId } }),
        tx.inventoryMovement.count({ where: { creadoPorId: userId } }),
        tx.expense.count({ where: { creadoPorId: userId } }),
        tx.cashClosure.count({ where: { cerradoPorId: userId } }),
        tx.purchase.count({ where: { creadoPorId: userId } }),
      ]);
      if (counts.some((count) => count > 0))
        throw new ConflictException(
          'El usuario tiene registros asociados y no puede eliminarse',
        );
      await tx.refreshToken.deleteMany({ where: { usuarioId: userId } });
      await tx.idempotencyKey.updateMany({
        where: { usuarioId: userId },
        data: { usuarioId: null },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  }

  async countActiveAdmins(tx: Prisma.TransactionClient = this.prisma) {
    return tx.user.count({
      where: {
        activo: true,
        rol: { nombre: 'ADMIN', activo: true },
      },
    });
  }

  private async requireUser(userId: string, tx: Prisma.TransactionClient) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { rol: true },
    });
    if (!user) throw new NotFoundException('Usuario inexistente');
    return user;
  }

  private async protectLastAdmin(
    user: Awaited<ReturnType<UsersService['requireUser']>>,
    tx: Prisma.TransactionClient,
  ) {
    if (
      user.activo &&
      user.rol?.nombre === 'ADMIN' &&
      user.rol?.activo &&
      (await this.countActiveAdmins(tx)) <= 1
    ) {
      throw new ConflictException(
        'No se puede remover el último administrador',
      );
    }
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { rol: true },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { rol: true },
    });
  }

  async listUsers(query: ListUsersDto): Promise<UserListPageDto> {
    const where: Prisma.UserWhereInput = {
      ...(query.activo === undefined
        ? {}
        : { activo: query.activo === 'true' }),
      ...(query.busqueda
        ? {
            OR: [
              { nombre: { contains: query.busqueda, mode: 'insensitive' } },
              { email: { contains: query.busqueda, mode: 'insensitive' } },
              { telefono: { contains: query.busqueda, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip: (query.pagina - 1) * query.limite,
        take: query.limite,
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
          activo: true,
          rol: { select: { id: true, nombre: true } },
          fechaCreacion: true,
        },
      }),
    ]);
    return {
      datos: users.map((user) => ({
        id: user.id,
        nombre: user.nombre,
        correo: user.email,
        telefono: user.telefono,
        roles: user.rol && isRoleName(user.rol.nombre) ? [user.rol.nombre] : [],
        activo: user.activo,
        fechaCreacion: user.fechaCreacion.toISOString(),
      })),
      pagina: query.pagina,
      limite: query.limite,
      total,
    };
  }

  create(
    data: {
      id?: string;
      nombre: string;
      email: string;
      passwordHash: string;
      telefono?: string | null;
      rolId: string;
      activo?: boolean;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.user.create({
      data: {
        id: data.id,
        nombre: data.nombre.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        telefono: data.telefono ? data.telefono.trim() : null,
        rolId: data.rolId,
        activo: data.activo ?? true,
      },
      include: { rol: true },
    });
  }
}
