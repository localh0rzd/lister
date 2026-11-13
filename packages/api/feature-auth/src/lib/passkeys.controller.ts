import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type { CurrentUser, PasskeyInfo } from '@lister/shared/api-contracts';
import { SignedInUser } from './decorators';
import { AddPasskeyDto } from './dto/passkeys.dto';
import { PasskeysService } from './passkeys.service';

/** The signed-in user's own passkeys. Nobody can see or remove anyone else's. */
@Controller('passkeys')
export class PasskeysController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Get()
  list(@SignedInUser() user: CurrentUser): PasskeyInfo[] {
    return this.passkeys.list(user.id);
  }

  @Post('options')
  @HttpCode(200)
  options(@SignedInUser() user: CurrentUser) {
    return this.passkeys.registrationOptions(user);
  }

  @Post()
  add(
    @Body() body: AddPasskeyDto,
    @SignedInUser() user: CurrentUser,
  ): Promise<PasskeyInfo> {
    return this.passkeys.add(user.id, body.name, body.response);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @SignedInUser() user: CurrentUser): void {
    this.passkeys.remove(user.id, id);
  }
}
