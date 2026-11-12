import { InjectionToken } from '@nestjs/common';

/** Current time in epoch milliseconds; replaced in tests. */
export type Clock = () => number;
export const CLOCK: InjectionToken<Clock> = Symbol('CLOCK');
