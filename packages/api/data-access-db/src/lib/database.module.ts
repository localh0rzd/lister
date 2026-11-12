import { type DynamicModule, Module } from '@nestjs/common';
import {
  DatabaseConnection,
  type DatabaseOptions,
  openDatabase,
} from './database';

/** Opens the database once at startup (migrating it) and shares the connection app-wide. */
@Module({})
export class DatabaseModule {
  static forRoot(options: () => DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: DatabaseConnection,
          useFactory: () => openDatabase(options()),
        },
      ],
      exports: [DatabaseConnection],
    };
  }
}
