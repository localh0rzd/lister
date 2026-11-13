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
import { SignedInUser } from '@lister/api/feature-auth';
import type { CurrentUser, SpaceSummary } from '@lister/shared/api-contracts';
import { AddMemberDto, CreateSpaceDto, RenameSpaceDto } from './dto/spaces.dto';
import { SpacesService } from './spaces.service';

/** Spaces and their members (design D14). Every route needs a session (the global guard). */
@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  list(@SignedInUser() user: CurrentUser): SpaceSummary[] {
    return this.spaces.list(user.id);
  }

  @Post()
  create(
    @SignedInUser() user: CurrentUser,
    @Body() body: CreateSpaceDto,
  ): SpaceSummary {
    return this.spaces.create(user.id, body.name);
  }

  @Patch(':id')
  rename(
    @SignedInUser() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameSpaceDto,
  ): SpaceSummary {
    return this.spaces.rename(user.id, id, body.name);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @SignedInUser() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): void {
    this.spaces.remove(user.id, id);
  }

  @Post(':id/members')
  addMember(
    @SignedInUser() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddMemberDto,
  ): SpaceSummary {
    return this.spaces.addMember(user.id, id, body.username);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @SignedInUser() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): void {
    this.spaces.removeMember(user.id, id, userId);
  }

  @Post(':id/leave')
  @HttpCode(204)
  leave(
    @SignedInUser() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): void {
    this.spaces.leave(user.id, id);
  }
}
