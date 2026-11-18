import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type AddMemberRequest,
  type CreateSpaceRequest,
  type RenameSpaceRequest,
  type SpaceSummary,
  type UserSuggestion,
  apiPath,
} from '@lister/shared/api-contracts';

/** The writes of space management (`/api/spaces`); the page reads the list itself. */
@Service()
export class SpacesApi {
  private readonly http = inject(HttpClient);

  create(request: CreateSpaceRequest): Promise<SpaceSummary> {
    return firstValueFrom(
      this.http.post<SpaceSummary>(apiPath('spaces'), request),
    );
  }

  rename(id: string, request: RenameSpaceRequest): Promise<SpaceSummary> {
    return firstValueFrom(
      this.http.patch<SpaceSummary>(apiPath('spaces', id), request),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(apiPath('spaces', id)));
  }

  addMember(id: string, request: AddMemberRequest): Promise<SpaceSummary> {
    return firstValueFrom(
      this.http.post<SpaceSummary>(apiPath('spaces', id, 'members'), request),
    );
  }

  /** Visible users matching `text`, without the members of the space (D27). */
  searchUsers(text: string, spaceId: string): Promise<UserSuggestion[]> {
    return firstValueFrom(
      this.http.get<UserSuggestion[]>(apiPath('user-search'), {
        params: { q: text, spaceId },
      }),
    );
  }

  removeMember(id: string, userId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(apiPath('spaces', id, 'members', userId)),
    );
  }

  leave(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(apiPath('spaces', id, 'leave'), {}),
    );
  }
}
