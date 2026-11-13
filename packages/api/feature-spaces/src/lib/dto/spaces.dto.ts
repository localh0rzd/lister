import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import {
  AUTH_LIMITS,
  SPACE_LIMITS,
  type AddMemberRequest,
  type CreateSpaceRequest,
  type RenameSpaceRequest,
} from '@lister/shared/api-contracts';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSpaceDto implements CreateSpaceRequest {
  @Transform(trim)
  @IsString()
  @Length(1, SPACE_LIMITS.nameMax)
  name!: string;
}

export class RenameSpaceDto implements RenameSpaceRequest {
  @Transform(trim)
  @IsString()
  @Length(1, SPACE_LIMITS.nameMax)
  name!: string;
}

export class AddMemberDto implements AddMemberRequest {
  @Transform(trim)
  @IsString()
  @Length(1, AUTH_LIMITS.usernameMax)
  username!: string;
}
