import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  Length,
  Matches,
  ValidateIf,
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

/**
 * Like `@IsOptional()`, but only for a missing field: `null` still fails validation (400) instead
 * of reaching the service, which only knows "given" or "left out".
 */
const IfPresent = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined);

export class UpdateUserDto implements UpdateUserRequest {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.displayNameMax)
  displayName?: string;

  @IfPresent()
  @IsBoolean()
  isAdmin?: boolean;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @Length(AUTH_LIMITS.passwordMin, AUTH_LIMITS.passwordMax)
  temporaryPassword!: string;
}
