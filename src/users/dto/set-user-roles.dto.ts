import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
} from 'class-validator';
import { ROLE_NAMES, type RoleName } from '../../roles/role-names.js';

export class SetUserRolesDto {
  @ApiProperty({
    enum: ROLE_NAMES,
    isArray: true,
    minItems: 1,
    maxItems: 2,
    uniqueItems: true,
    example: ['VENDEDOR'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(ROLE_NAMES, { each: true })
  roles!: RoleName[];
}
