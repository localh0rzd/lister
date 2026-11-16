import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Clipboard } from '@angular/cdk/clipboard';
import type {
  RegistrationToken,
  RegistrationTokenList,
} from '@lister/shared/api-contracts';
import { Notifier } from '@lister/web/util-notify';
import { RegistrationLinks } from './registration-links';

const token = (value: string): RegistrationToken => ({
  token: value,
  createdAt: '2026-11-16T10:00:00.000Z',
  createdBy: 'Boss',
  expiresAt: '2026-11-23T10:00:00.000Z',
});

let http: HttpTestingController;
let notify: ReturnType<typeof vi.fn>;
let copy: ReturnType<typeof vi.fn>;

async function render(list: RegistrationTokenList, copied = true) {
  notify = vi.fn(async () => 'dismissed');
  copy = vi.fn(() => copied);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Notifier, useValue: { notify } },
      { provide: Clipboard, useValue: { copy } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(RegistrationLinks);
  fixture.detectChanges();
  http.expectOne('/api/registration-tokens').flush(list);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    element.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  return { fixture, element, button };
}

afterEach(() => {
  http.verify();
  TestBed.resetTestingModule();
});

describe('RegistrationLinks', () => {
  it('shows each unused token as a link with who made it and when it expires', async () => {
    const { element } = await render({
      publicUrl: 'https://lister.example',
      tokens: [token('ABCD1234WXYZ')],
    });

    const row = element.querySelector('li.link')?.textContent ?? '';
    expect(row).toContain('https://lister.example/register?token=ABCD1234WXYZ');
    expect(row).toContain('Boss');
    expect(row).toContain('Nov 16, 2026');
    expect(row).toContain('Nov 23, 2026');
  });

  it("uses the page's own origin when the server has no public URL", async () => {
    const { element } = await render({
      publicUrl: null,
      tokens: [token('ABCD1234WXYZ')],
    });

    expect(element.querySelector('.url')?.textContent).toBe(
      `${location.origin}/register?token=ABCD1234WXYZ`,
    );
  });

  it('says so when there are no links', async () => {
    const { element } = await render({ publicUrl: null, tokens: [] });

    expect(element.textContent).toContain('No unused links.');
  });

  it('copies the link and confirms it', async () => {
    const { button } = await render({
      publicUrl: 'https://lister.example',
      tokens: [token('ABCD1234WXYZ')],
    });

    button('Copy link ABCD1234WXYZ')?.click();

    expect(copy).toHaveBeenCalledWith(
      'https://lister.example/register?token=ABCD1234WXYZ',
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Link copied' }),
    );
  });

  it('tells the admin when copying did not work', async () => {
    const { button } = await render(
      { publicUrl: null, tokens: [token('ABCD1234WXYZ')] },
      false,
    );

    button('Copy link ABCD1234WXYZ')?.click();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Could not copy'),
      }),
    );
  });

  it('creates a link and shows the list again', async () => {
    const { element, fixture } = await render({ publicUrl: null, tokens: [] });

    element.querySelector<HTMLButtonElement>('.heading button')?.click();
    http
      .expectOne({ method: 'POST', url: '/api/registration-tokens' })
      .flush(token('NEWTOKEN0001'));
    await vi.waitFor(() =>
      http.expectOne('/api/registration-tokens').flush({
        publicUrl: null,
        tokens: [token('NEWTOKEN0001')],
      }),
    );
    await fixture.whenStable();

    expect(element.querySelector('li.link')?.textContent).toContain(
      'NEWTOKEN0001',
    );
  });

  it('removes a link at once and says it no longer works', async () => {
    const { button, fixture, element } = await render({
      publicUrl: null,
      tokens: [token('ABCD1234WXYZ')],
    });

    button('Remove link ABCD1234WXYZ')?.click();
    http
      .expectOne({
        method: 'DELETE',
        url: '/api/registration-tokens/ABCD1234WXYZ',
      })
      .flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() =>
      http
        .expectOne('/api/registration-tokens')
        .flush({ publicUrl: null, tokens: [] }),
    );
    await fixture.whenStable();

    expect(element.querySelector('li.link')).toBeNull();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Link removed. It no longer works.',
      }),
    );
  });

  it('shows the server error when removing fails', async () => {
    const { button } = await render({
      publicUrl: null,
      tokens: [token('ABCD1234WXYZ')],
    });

    button('Remove link ABCD1234WXYZ')?.click();
    http
      .expectOne('/api/registration-tokens/ABCD1234WXYZ')
      .flush(
        { message: 'That token does not exist' },
        { status: 404, statusText: 'Not Found' },
      );
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'That token does not exist' }),
      ),
    );
  });
});
