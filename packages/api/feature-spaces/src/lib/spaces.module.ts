import { Module } from '@nestjs/common';
import { SyncModule } from '@lister/api/feature-sync';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

/**
 * Spaces and memberships over REST (design D14); the content of a space syncs elsewhere.
 * Imports `SyncModule` to tell connected clients when memberships change.
 */
@Module({
  imports: [SyncModule],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
