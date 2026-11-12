import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonToggleHarness } from '@angular/material/button-toggle/testing';
import type { HealthResponse } from '@lister/shared/api-contracts';
import { THEME_STORAGE_KEY } from '@lister/web/util-theme';
import { Home } from './home';

describe('Home', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.colorScheme = '';
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function flushHealth() {
    TestBed.inject(HttpTestingController)
      .expectOne('/api/health')
      .flush({
        status: 'ok',
        service: 'lister-api',
        timestamp: new Date().toISOString(),
      } satisfies HealthResponse);
  }

  it('shows the API status', async () => {
    const fixture = TestBed.createComponent(Home);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    flushHealth();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ok');
    http.verify();
  });

  it('switches to the dark theme and remembers it', async () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    flushHealth();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);

    const dark = await loader.getHarness(
      MatButtonToggleHarness.with({ text: /Dark/ }),
    );
    await dark.check();
    TestBed.tick();

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
