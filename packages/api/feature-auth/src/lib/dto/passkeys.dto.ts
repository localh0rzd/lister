import { Transform } from 'class-transformer';
import { IsObject, IsString, Length } from 'class-validator';
import {
  PASSKEY_NAME_MAX,
  type AddPasskeyRequest,
  type PasskeyLoginRequest,
  type WebAuthnJson,
} from '@lister/shared/api-contracts';

export class AddPasskeyDto implements AddPasskeyRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, PASSKEY_NAME_MAX)
  name!: string;

  @IsObject()
  response!: WebAuthnJson;
}

export class PasskeyLoginDto implements PasskeyLoginRequest {
  @IsObject()
  response!: WebAuthnJson;
}
