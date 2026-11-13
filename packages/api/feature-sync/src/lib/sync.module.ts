import { Module } from '@nestjs/common';
import { AuthModule } from '@lister/api/feature-auth';
import { CLOCK, type Clock } from './clock';
import { MutationService } from './mutation.service';
import { SyncGateway } from './sync.gateway';
import { SyncReader } from './sync-reader';

/** Synced data: the Socket.IO gateway, mutation handlers and pulls. */
@Module({
  imports: [AuthModule],
  providers: [
    MutationService,
    SyncReader,
    SyncGateway,
    { provide: CLOCK, useValue: (() => Date.now()) satisfies Clock },
  ],
  exports: [MutationService, SyncGateway],
})
export class SyncModule {}
