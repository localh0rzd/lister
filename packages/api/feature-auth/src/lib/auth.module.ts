import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AttemptLimits } from './attempt-limits.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AUTH_CLOCK, type Clock } from './clock';
import { SetupTokenService } from './setup-token.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Accounts, sessions and sign-in (design §2.3). Registers `AuthGuard` for every HTTP route:
 * routes need a session unless they're `@Public()`.
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    UsersService,
    SetupTokenService,
    AttemptLimits,
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: AUTH_CLOCK, useValue: (() => Date.now()) satisfies Clock },
  ],
  exports: [AuthService],
})
export class AuthModule {}
