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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserRoles(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await this.requireUser(userId, tx);
    return {
      userId,
      roles: user.roles
        .filter(({ role }) => role.isActive && isRoleName(role.name))
        .map(({ role }) => role.name)
        .sort(),
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
    return serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      const resolved = await tx.role.findMany({
        where: { name: { in: roles } },
      });
      if (resolved.length !== roles.length)
        throw new InternalServerErrorException('Roles no configurados');
      if (resolved.some((role) => !role.isActive))
        throw new UnprocessableEntityException('Rol inactivo');
      if (!roles.includes('ADMIN')) await this.protectLastAdmin(user, tx);
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: resolved.map((role) => ({ userId, roleId: role.id })),
        skipDuplicates: true,
      });
      return this.getUserRoles(userId, tx);
    });
  }

  async removeUserRole(userId: string, roleName: RoleName): Promise<void> {
    if (!isRoleName(roleName)) throw new BadRequestException('Rol inválido');
    await serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      if (roleName === 'ADMIN') await this.protectLastAdmin(user, tx);
      await tx.userRole.deleteMany({
        where: { userId, role: { name: roleName } },
      });
    });
  }

  async deleteUser(userId: string, requesterId: string): Promise<void> {
    if (userId === requesterId)
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    await serializableTransaction(this.prisma, async (tx) => {
      const user = await this.requireUser(userId, tx);
      if (
        user.isActive &&
        user.roles.some(
          ({ role }) => role.name === 'ADMIN' && role.isActive,
        ) &&
        (await this.countActiveAdmins(tx)) <= 1
      ) {
        throw new ConflictException(
          'No se puede eliminar el último administrador',
        );
      }
      const [quotes, sales, payments, movements] = await Promise.all([
        tx.quote.count({ where: { createdById: userId } }),
        tx.sale.count({ where: { createdById: userId } }),
        tx.payment.count({ where: { createdById: userId } }),
        tx.inventoryMovement.count({ where: { createdById: userId } }),
      ]);
      if (quotes + sales + payments + movements > 0)
        throw new ConflictException(
          'El usuario tiene registros asociados y no puede eliminarse',
        );
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.idempotencyKey.updateMany({
        where: { userId },
        data: { userId: null },
      });
      await tx.user.delete({ where: { id: userId } });
    });
  }

  countActiveAdmins(tx: Prisma.TransactionClient = this.prisma) {
    return tx.user.count({
      where: {
        isActive: true,
        roles: { some: { role: { name: 'ADMIN', isActive: true } } },
      },
    });
  }

  private async requireUser(userId: string, tx: Prisma.TransactionClient) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Usuario inexistente');
    return user;
  }

  private async protectLastAdmin(
    user: Awaited<ReturnType<UsersService['requireUser']>>,
    tx: Prisma.TransactionClient,
  ) {
    if (
      user.isActive &&
      user.roles.some(({ role }) => role.name === 'ADMIN' && role.isActive) &&
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
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  create(
    data: {
      id?: string;
      name: string;
      email: string;
      passwordHash: string;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.user.create({
      data: {
        ...data,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
      },
      include: { roles: { include: { role: true } } },
    });
  }
}
