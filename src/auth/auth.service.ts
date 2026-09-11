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
type UserWithRoles = NonNullable<Awaited<ReturnType<UsersService['findById']>>>;

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
    const user: AuthUser = {
      id: randomUUID(),
      name: dto.name.trim(),
      email,
      roles: [],
    };
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const name = (await tx.user.count()) === 0 ? 'ADMIN' : 'VENDEDOR';
        const role = await tx.role.findUnique({ where: { name } });
        if (!role?.isActive)
          throw new InternalServerErrorException(
            'Rol inicial no configurado o inactivo',
          );
        user.roles = [name];
        const session = await this.issueSession(user);
        await this.users.create(
          { id: user.id, name: user.name, email, passwordHash },
          tx,
        );
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
        await tx.refreshToken.create({ data: session.record });
        return { user, ...session.tokens };
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
      !user.isActive
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const publicUser = this.publicUser(user);
    const session = await this.issueSession(publicUser);
    await this.prisma.refreshToken.create({ data: session.record });
    return { user: publicUser, ...session.tokens };
  }

  async refresh(token: string): Promise<TokenPair> {
    const payload = await this.verifyRefresh(token);
    if (!payload) throw new UnauthorizedException('Sesión inválida');
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !record ||
      record.userId !== payload.sub ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      !this.matchesHash(token, record.tokenHash)
    ) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const user = await this.users.findById(payload.sub);
    if (!user?.isActive) throw new UnauthorizedException('Sesión inválida');
    const session = await this.issueSession(this.publicUser(user));
    await this.prisma.$transaction(async (tx) => {
      // PostgreSQL rechecks this predicate after a concurrent update commits.
      // Exactly one caller consumes the old session; failures roll back revocation.
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: record.id,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { isActive: true },
        },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException('Sesión inválida');
      await tx.refreshToken.create({ data: session.record });
    });
    return session.tokens;
  }

  async logout(token: string): Promise<void> {
    // Invalid/expired tokens are a successful no-op, as required by the contract.
    const payload = await this.verifyRefresh(token);
    if (!payload) return;
    await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash: this.hashToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private publicUser(user: UserWithRoles): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles
        .filter(({ role }) => role.isActive && isRoleName(role.name))
        .map(({ role }) => role.name),
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
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date((issuedAt + lifetime) * 1000),
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
