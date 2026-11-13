import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type AddPasskeyRequest,
  type PasskeyInfo,
  type WebAuthnJson,
  apiPath,
} from '@lister/shared/api-contracts';
import { describeAuthError } from './auth-session';
import { WebAuthnClient } from './webauthn-client';

/** Why a passkey ceremony failed, in words for the user. */
export function describePasskeyError(error: unknown, fallback: string): string {
  const name = (error as { name?: unknown } | null)?.name;
  const code = (error as { code?: unknown } | null)?.code;
  if (name === 'NotAllowedError') {
    return 'The passkey request was cancelled or timed out.';
  }
  if (
    name === 'InvalidStateError' ||
    code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
  ) {
    return 'This device already has a passkey for your account.';
  }
  return describeAuthError(error, fallback);
}

/** The signed-in user's passkeys: adding and removing (the list is read with `httpResource`). */
@Service()
export class Passkeys {
  private readonly http = inject(HttpClient);
  private readonly client = inject(WebAuthnClient);

  /** The URL of the list of the user's own passkeys, for `httpResource()`. */
  readonly listUrl = apiPath('passkeys');

  supported(): Promise<boolean> {
    return this.client.supported();
  }

  /** Creates a passkey on an authenticator of the user's choice and stores it under `name`. */
  async add(name: string): Promise<PasskeyInfo> {
    const options = await firstValueFrom(
      this.http.post<WebAuthnJson>(apiPath('passkeys', 'options'), {}),
    );
    const response = await this.client.register(options);
    const body: AddPasskeyRequest = { name, response };
    return firstValueFrom(
      this.http.post<PasskeyInfo>(apiPath('passkeys'), body),
    );
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(apiPath('passkeys', encodeURIComponent(id))),
    );
  }
}
