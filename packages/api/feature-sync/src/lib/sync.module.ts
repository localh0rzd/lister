import { Module } from '@nestjs/common';
import { CLOCK, type Clock } from './clock';
import { DevSeed } from './dev-seed';
import { MutationService } from './mutation.service';

/** Synced data: mutation handlers now, the Socket.IO gateway from T-007. */
@Module({
  providers: [
    MutationService,
    DevSeed,
    { provide: CLOCK, useValue: (() => Date.now()) satisfies Clock },
  ],
  exports: [MutationService],
})
export class SyncModule {}
