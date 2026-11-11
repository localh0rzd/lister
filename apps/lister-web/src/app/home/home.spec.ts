import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { HealthResponse } from '@lister/shared/api-contracts';
import { Home } from './home';

describe('Home', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('shows the API status', async () => {
    const fixture = TestBed.createComponent(Home);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/health').flush({
      status: 'ok',
      service: 'lister-api',
      timestamp: new Date().toISOString(),
    } satisfies HealthResponse);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ok');
    http.verify();
  });
});
