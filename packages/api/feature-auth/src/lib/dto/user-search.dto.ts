import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import {
  USER_SEARCH,
  type UserSearchQuery,
} from '@lister/shared/api-contracts';

export class UserSearchQueryDto implements UserSearchQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(USER_SEARCH.minLength, USER_SEARCH.maxLength)
  q!: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
