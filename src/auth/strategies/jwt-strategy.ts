import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service.js';
import { JwtPayload } from '../types/jwt-payload.type.js';
import { isUUID } from 'class-validator';
import { isRoleName } from '../../roles/role-names.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (
      !payload ||
      !isUUID(payload.sub) ||
      typeof payload.email !== 'string' ||
      !Array.isArray(payload.roles)
    ) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles
        .filter(({ role }) => role.isActive && isRoleName(role.name))
        .map((userRole) => userRole.role.name),
    };
  }
}
