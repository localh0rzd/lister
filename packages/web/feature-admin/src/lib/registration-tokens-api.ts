import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { type RegistrationToken, apiPath } from '@lister/shared/api-contracts';

/** The writes on registration tokens (`/api/registration-tokens`, admins only); the list is read by the component. */
@Service()
export class RegistrationTokensApi {
  private readonly http = inject(HttpClient);

  create(): Promise<RegistrationToken> {
    return firstValueFrom(
      this.http.post<RegistrationToken>(apiPath('registration-tokens'), {}),
    );
  }

  remove(token: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(apiPath('registration-tokens', token)),
    );
  }
}
