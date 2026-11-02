import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import { isRoleName, type RoleName } from '../roles/role-names.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { UserListPageDto } from './dto/user-list.dto.js';
import { UserDto } from './dto/user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

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

  async getUser(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { rol: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario inexistente');
    }
    return this.toUserDto(user);
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserDto> {
    return serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);

      const nombre = dto.nombre ?? dto.name;
      const rawEmail = dto.correo ?? dto.email;
      const email =
        rawEmail !== undefined ? rawEmail.trim().toLowerCase() : undefined;
      const rawTelefono =
        dto.telefono !== undefined ? dto.telefono : dto.phone;
      const telefono = rawTelefono !== undefined ? rawTelefono : undefined;
      const activo = dto.activo !== undefined ? dto.activo : dto.isActive;
      const password = dto.contrasena ?? dto.password;

      if (email !== undefined && email !== user.email) {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing && existing.id !== userId) {
          throw new ConflictException('Correo ya registrado');
        }
      }

      let newRoleId: string | null | undefined = undefined;
      if (dto.rol !== undefined) {
        const role = await tx.role.findUnique({ where: { nombre: dto.rol } });
        if (!role || !role.activo) {
          throw new UnprocessableEntityException('Rol inactivo');
        }
        newRoleId = role.id;
      } else if (dto.rolId !== undefined) {
        if (dto.rolId === null) {
          newRoleId = null;
        } else {
          const role = await tx.role.findUnique({ where: { id: dto.rolId } });
          if (!role) {
            throw new NotFoundException('Rol no encontrado');
          }
          if (!role.activo) {
            throw new UnprocessableEntityException('Rol inactivo');
          }
          newRoleId = role.id;
        }
      }

      const isCurrentActiveAdmin =
        user.activo && user.rol?.nombre === 'ADMIN' && user.rol?.activo;

      if (isCurrentActiveAdmin) {
        if (activo === false) {
          const activeAdmins = await this.countActiveAdmins(tx);
          if (activeAdmins <= 1) {
            throw new ConflictException(
              'No se puede desactivar el último administrador',
            );
          }
        }

        if (newRoleId !== undefined && newRoleId !== user.rolId) {
          let isStillAdmin = false;
          if (newRoleId) {
            const nextRole = await tx.role.findUnique({
              where: { id: newRoleId },
            });
            if (nextRole?.nombre === 'ADMIN' && nextRole.activo) {
              isStillAdmin = true;
            }
          }
          if (!isStillAdmin) {
            const activeAdmins = await this.countActiveAdmins(tx);
            if (activeAdmins <= 1) {
              throw new ConflictException(
                'No se puede remover el último administrador',
              );
            }
          }
        }
      }

      const data: Prisma.UserUncheckedUpdateInput = {};
      if (nombre !== undefined) data.nombre = nombre;
      if (email !== undefined) data.email = email;
      if (telefono !== undefined) data.telefono = telefono;
      if (activo !== undefined) data.activo = activo;
      if (password !== undefined) {
        const rounds = this.config?.get<number>('BCRYPT_ROUNDS') ?? 12;
        data.passwordHash = await bcrypt.hash(password, rounds);
      }
      if (newRoleId !== undefined) {
        data.rolId = newRoleId;
      }

      if (Object.keys(data).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data,
        });
      }

      const updated = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { rol: true },
      });

      return this.toUserDto(updated);
    });
  }

  toUserDto(user: {
    id: string;
    nombre: string;
    email: string;
    telefono: string | null;
    activo: boolean;
    rolId?: string | null;
    rol?: { id: string; nombre: string; activo?: boolean } | null;
    fechaCreacion: Date | string;
    fechaActualizacion?: Date | string;
  }): UserDto {
    const rolNombre =
      user.rol?.activo && isRoleName(user.rol.nombre) ? user.rol.nombre : null;
    const toIsoString = (d: Date | string | undefined) => {
      if (!d) return new Date().toISOString();
      return typeof d === 'string' ? d : d.toISOString();
    };
    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.email,
      email: user.email,
      telefono: user.telefono,
      activo: user.activo,
      rolId: user.rolId ?? user.rol?.id ?? null,
      rol: rolNombre ?? (user.rol?.nombre ?? null),
      roles: rolNombre ? [rolNombre] : [],
      fechaCreacion: toIsoString(user.fechaCreacion),
      fechaActualizacion: toIsoString(
        user.fechaActualizacion ?? user.fechaCreacion,
      ),
    };
  }
}
