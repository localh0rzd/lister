import { InjectionToken } from '@nestjs/common';

/** Current time in epoch milliseconds; replaced in tests. */
export type Clock = () => number;
export const AUTH_CLOCK: InjectionToken<Clock> = Symbol('AUTH_CLOCK');
