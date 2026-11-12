import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  AUTH_LIMITS,
  type ChangePasswordRequest,
  type LoginRequest,
  type SetupRequest,
} from '@lister/shared/api-contracts';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LoginDto implements LoginRequest {
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  username!: string;

  // Not length-checked beyond a cap: a wrong password is a 401, whatever its length.
  @IsString()
  @Length(1, AUTH_LIMITS.passwordMax)
  password!: string;
}

export class SetupDto implements SetupRequest {
  @IsString()
  @Length(1, 200)
  token!: string;

  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  @Matches(/^[\p{L}\p{N}._-]+$/u, {
    message: 'username may only contain letters, numbers, ".", "_" and "-"',
  })
  username!: string;

  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.displayNameMax)
  displayName!: string;

  @IsString()
  @Length(AUTH_LIMITS.passwordMin, AUTH_LIMITS.passwordMax)
  password!: string;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @MaxLength(AUTH_LIMITS.passwordMax)
  currentPassword!: string;

  @IsString()
  @Length(AUTH_LIMITS.passwordMin, AUTH_LIMITS.passwordMax)
  newPassword!: string;
}
