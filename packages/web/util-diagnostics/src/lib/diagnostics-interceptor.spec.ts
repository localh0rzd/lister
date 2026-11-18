import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Diagnostics } from './diagnostics';
import { diagnosticsInterceptor } from './diagnostics-interceptor';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([diagnosticsInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const log = vi.spyOn(TestBed.inject(Diagnostics), 'log');
  return {
    log,
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
  };
}

describe('diagnosticsInterceptor', () => {
  it('logs method, path without the query, status and duration', async () => {
    const { log, http, controller } = setup();
    const result = firstValueFrom(http.get('/api/auth/me?token=secret'));
    controller
      .expectOne('/api/auth/me?token=secret')
      .flush({}, { status: 200, statusText: 'OK' });
    await result;
    expect(log).toHaveBeenCalledWith('rest', 'start', {
      method: 'GET',
      path: '/api/auth/me',
    });
    expect(log).toHaveBeenCalledWith(
      'rest',
      'end',
      expect.objectContaining({
        method: 'GET',
        path: '/api/auth/me',
        status: 200,
        ms: expect.any(Number),
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });

  it('logs a failed call with its status', async () => {
    const { log, http, controller } = setup();
    const result = firstValueFrom(
      http.post('/api/auth/login', { password: 'hunter2' }),
    ).catch(() => undefined);
    controller
      .expectOne('/api/auth/login')
      .flush('no', { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(log).toHaveBeenCalledWith(
      'rest',
      'error',
      expect.objectContaining({ status: 401, network: false }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('hunter2');
  });

  it('marks a network failure (status 0)', async () => {
    const { log, http, controller } = setup();
    const result = firstValueFrom(http.get('/api/health')).catch(
      () => undefined,
    );
    controller.expectOne('/api/health').error(new ProgressEvent('error'));
    await result;
    expect(log).toHaveBeenCalledWith(
      'rest',
      'error',
      expect.objectContaining({ status: 0, network: true }),
    );
  });

  it('learns the server time offset from the Date header', async () => {
    const { http, controller } = setup();
    const result = firstValueFrom(http.get('/api/health'));
    controller
      .expectOne('/api/health')
      .flush(
        {},
        { headers: { Date: new Date(Date.now() + 60_000).toUTCString() } },
      );
    await result;
    const offset = TestBed.inject(Diagnostics).serverTimeOffsetMs;
    expect(offset).toBeGreaterThan(50_000);
    expect(offset).toBeLessThan(61_000);
  });
});
