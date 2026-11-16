import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import type {
  CurrentUser,
  RegistrationToken,
  RegistrationTokenList,
} from '@lister/shared/api-contracts';
import { AdminOnly, SignedInUser } from './decorators';
import { RegistrationTokensService } from './registration-tokens.service';

/** Registration tokens: admins only (design D23). */
@AdminOnly()
@Controller('registration-tokens')
export class RegistrationTokensController {
  constructor(private readonly tokens: RegistrationTokensService) {}

  @Get()
  list(): RegistrationTokenList {
    return {
      publicUrl: publicOrigin(process.env['PUBLIC_URL']),
      tokens: this.tokens.list(),
    };
  }

  @Post()
  create(@SignedInUser() admin: CurrentUser): RegistrationToken {
    return this.tokens.create(admin.id);
  }

  @Delete(':token')
  @HttpCode(204)
  remove(@Param('token') token: string): void {
    this.tokens.remove(token);
  }
}

/** The origin of `PUBLIC_URL`, or null when it is unset or not a URL. */
function publicOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}
