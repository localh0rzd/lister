import { Module } from '@nestjs/common';
import { CLOCK, type Clock } from './clock';
import { DevSeed } from './dev-seed';
import { MutationService } from './mutation.service';
import { SyncGateway } from './sync.gateway';
import { SyncReader } from './sync-reader';

/** Synced data: the Socket.IO gateway, mutation handlers and pulls. */
@Module({
  providers: [
    MutationService,
    SyncReader,
    SyncGateway,
    DevSeed,
    { provide: CLOCK, useValue: (() => Date.now()) satisfies Clock },
  ],
  exports: [MutationService],
})
export class SyncModule {}
