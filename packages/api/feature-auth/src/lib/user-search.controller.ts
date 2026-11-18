import { Controller, Get, Query } from '@nestjs/common';
import type { CurrentUser, UserSuggestion } from '@lister/shared/api-contracts';
import { UserSearchQueryDto } from './dto/user-search.dto';
import { SignedInUser } from './decorators';
import { UserSearchService } from './user-search.service';

/** Suggests users to add to a space; any signed-in user may ask (design D27). */
@Controller('user-search')
export class UserSearchController {
  constructor(private readonly search: UserSearchService) {}

  @Get()
  find(
    @SignedInUser() user: CurrentUser,
    @Query() query: UserSearchQueryDto,
  ): UserSuggestion[] {
    return this.search.search(user.id, query);
  }
}
