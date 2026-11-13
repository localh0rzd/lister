import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type CreateUserRequest,
  type CurrentUser,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  apiPath,
} from '@lister/shared/api-contracts';

/** The writes of user administration (`/api/users`, admins only); the page reads the list itself. */
@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);

  create(request: CreateUserRequest): Promise<CurrentUser> {
    return firstValueFrom(
      this.http.post<CurrentUser>(apiPath('users'), request),
    );
  }

  update(id: string, request: UpdateUserRequest): Promise<CurrentUser> {
    return firstValueFrom(
      this.http.patch<CurrentUser>(apiPath('users', id), request),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(apiPath('users', id)));
  }

  resetPassword(id: string, request: ResetPasswordRequest): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(apiPath('users', id, 'password'), request),
    );
  }
}
