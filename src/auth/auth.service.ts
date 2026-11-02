import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { isUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AuthUser } from './types/auth-user.type.js';
import type { AuthResult, TokenPair } from './types/auth-result.type.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import { isRoleName } from '../roles/role-names.js';

type RefreshPayload = { sub: string; jti: string; exp: number };
type UserWithRole = NonNullable<Awaited<ReturnType<UsersService['findById']>>>;

const ADMIN_SECTIONS = [
  'VENTAS',
  'PRODUCTOS',
  'CATALOGO',
  'INVENTARIO',
  'CLIENTES',
  'PROVEEDORES',
  'COMPRAS',
  'COTIZACIONES',
  'GASTOS',
  'CORTES_CAJA',
  'TABLERO',
  'USUARIOS',
  'CONFIGURACION',
];

const VENDEDOR_SECTIONS = [
  'VENTAS',
  'COTIZACIONES',
  'CLIENTES',
  'PRODUCTOS',
  'INVENTARIO',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Correo ya registrado');
    }
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.config.getOrThrow<number>('BCRYPT_ROUNDS'),
    );

    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const isFirst = (await tx.user.count()) === 0;
        let role = null;

        if (isFirst) {
          role = await tx.role.findUnique({ where: { nombre: 'ADMIN' } });
        } else if (dto.rolId) {
          role = await tx.role.findUnique({ where: { id: dto.rolId } });
        } else {
          role = await tx.role.findUnique({ where: { nombre: 'VENDEDOR' } });
        }

        if (!role || !role.activo) {
          throw new InternalServerErrorException(
            'Rol inicial no configurado o inactivo',
          );
        }

        const userId = randomUUID();
        const createdUser = await tx.user.create({
          data: {
            id: userId,
            nombre: dto.name.trim(),
            email,
            passwordHash,
            telefono: dto.telefono ? dto.telefono.trim() : null,
            rolId: role.id,
            activo: true,
          },
          include: { rol: true },
        });

        const user = this.publicUser(createdUser);
        const session = await this.issueSession(user);
        await tx.refreshToken.create({ data: session.record });
        return { user, usuario: user, ...session.tokens };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Correo ya registrado');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email.trim().toLowerCase());
    if (
      !user ||
      !(await bcrypt.compare(dto.password, user.passwordHash)) ||
      !user.activo
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const publicUser = this.publicUser(user);
    const session = await this.issueSession(publicUser);
    await this.prisma.refreshToken.create({ data: session.record });
    return { user: publicUser, usuario: publicUser, ...session.tokens };
  }

  async refresh(token: string): Promise<TokenPair> {
    const payload = await this.verifyRefresh(token);
    if (!payload) throw new UnauthorizedException('Sesión inválida');
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !record ||
      record.usuarioId !== payload.sub ||
      record.fechaRevocacion ||
      record.fechaVencimiento <= new Date() ||
      !this.matchesHash(token, record.tokenHash)
    ) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.activo) throw new UnauthorizedException('Sesión inválida');
    const session = await this.issueSession(this.publicUser(user));
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: record.id,
          usuarioId: user.id,
          fechaRevocacion: null,
          fechaVencimiento: { gt: new Date() },
          usuario: { activo: true },
        },
        data: { fechaRevocacion: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException('Sesión inválida');
      await tx.refreshToken.create({ data: session.record });
    });
    return session.tokens;
  }

  async logout(token: string): Promise<void> {
    const payload = await this.verifyRefresh(token);
    if (!payload) return;
    await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        usuarioId: payload.sub,
        tokenHash: this.hashToken(token),
        fechaRevocacion: null,
      },
      data: { fechaRevocacion: new Date() },
    });
  }

  private publicUser(user: UserWithRole): AuthUser {
    const rolNombre = user.rol?.activo && isRoleName(user.rol.nombre) ? user.rol.nombre : '';
    const hasAdmin = rolNombre === 'ADMIN';
    return {
      id: user.id,
      nombre: user.nombre,
      name: user.nombre,
      email: user.email,
      telefono: user.telefono,
      activo: user.activo,
      rol: rolNombre,
      rolId: user.rolId,
      roles: rolNombre ? [rolNombre] : [],
      hasAdmin,
      seccionesPermitidas: hasAdmin ? ADMIN_SECTIONS : rolNombre ? VENDEDOR_SECTIONS : [],
    };
  }

  private async issueSession(user: AuthUser) {
    const id = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const lifetime = this.config.getOrThrow<number>('JWT_REFRESH_EXPIRES_IN');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({
        sub: user.id,
        email: user.email,
        roles: user.roles,
      }),
      this.jwt.signAsync(
        { sub: user.id, jti: id, iat: issuedAt },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithm: 'HS256',
          expiresIn: lifetime,
        },
      ),
    ]);
    return {
      tokens: { accessToken, refreshToken },
      record: {
        id,
        usuarioId: user.id,
        tokenHash: this.hashToken(refreshToken),
        fechaVencimiento: new Date((issuedAt + lifetime) * 1000),
      },
    };
  }

  private async verifyRefresh(token: string): Promise<RefreshPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
      if (
        !payload ||
        !isUUID(payload.sub) ||
        !isUUID(payload.jti) ||
        !Number.isInteger(payload.exp)
      )
        return null;
      return payload;
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private matchesHash(token: string, stored: string): boolean {
    return (
      /^[a-f0-9]{64}$/.test(stored) &&
      timingSafeEqual(
        Buffer.from(this.hashToken(token), 'hex'),
        Buffer.from(stored, 'hex'),
      )
    );
  }
}
