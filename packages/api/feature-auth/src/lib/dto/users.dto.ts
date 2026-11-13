import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  AUTH_LIMITS,
  USERNAME_PATTERN,
  type CreateUserRequest,
  type ResetPasswordRequest,
  type UpdateUserRequest,
} from '@lister/shared/api-contracts';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const USERNAME_MESSAGE =
  'username may only contain letters a–z, digits, ".", "_" and "-"';

export class CreateUserDto implements CreateUserRequest {
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.displayNameMax)
  displayName!: string;

  @IsString()
  @Length(AUTH_LIMITS.passwordMin, AUTH_LIMITS.passwordMax)
  temporaryPassword!: string;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.displayNameMax)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @Length(AUTH_LIMITS.passwordMin, AUTH_LIMITS.passwordMax)
  temporaryPassword!: string;
}
