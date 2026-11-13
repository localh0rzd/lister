import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

/** Spaces and memberships over REST (design D14); the content of a space syncs elsewhere. */
@Module({
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
