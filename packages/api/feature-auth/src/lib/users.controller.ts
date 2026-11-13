import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { AdminOnly } from './decorators';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

/** User administration: admins only (design §2.3). */
@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): CurrentUser[] {
    return this.users.list();
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<CurrentUser> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ): CurrentUser {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): void {
    this.users.remove(id);
  }

  @Post(':id/password')
  @HttpCode(204)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(id, body.temporaryPassword);
  }
}
