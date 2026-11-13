import {
  type ExecutionContext,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { SameOriginGuard } from './same-origin.guard';

const ORIGIN = 'https://lister.example.org';
const guard = new SameOriginGuard([ORIGIN]);

function httpContext(
  method: string,
  headers: Record<string, string | string[]>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  it.each([
    ['GET from another site', 'GET', { origin: 'https://evil.example' }],
    ['HEAD from another site', 'HEAD', { origin: 'https://evil.example' }],
    ['a form-encoded GET', 'GET', { 'content-type': 'text/plain' }],
    ['a POST from the app itself', 'POST', { origin: ORIGIN }],
    [
      'a JSON POST from the app itself',
      'POST',
      { origin: ORIGIN, 'content-type': 'application/json; charset=utf-8' },
    ],
    [
      'a JSON POST in upper case',
      'POST',
      { 'content-type': 'Application/JSON' },
    ],
    ['a POST without Origin or body (curl)', 'POST', {}],
    ['a DELETE without a body', 'DELETE', { origin: ORIGIN }],
  ])('lets %s through', (_, method, headers) => {
    expect(guard.canActivate(httpContext(method, headers))).toBe(true);
  });

  it.each([
    ['another site', 'https://evil.example'],
    ['a sibling subdomain', 'https://other.lister.example.org'],
    ['a look-alike host', 'https://lister.example.org.evil.example'],
    ['plain http of the same host', 'http://lister.example.org'],
    ['a sandboxed or privacy-stripped page', 'null'],
  ])('refuses a write from %s with 403', (_, origin) => {
    expect(() =>
      guard.canActivate(
        httpContext('POST', { origin, 'content-type': 'application/json' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([
    ['PATCH', { origin: ['https://evil.example'] }],
    ['PUT', { origin: 'https://evil.example' }],
    ['DELETE', { origin: 'https://evil.example' }],
  ])('refuses a cross-site %s with 403', (method, headers) => {
    expect(() => guard.canActivate(httpContext(method, headers))).toThrow(
      ForbiddenException,
    );
  });

  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'text/plain',
    'application/json-patch+json',
  ])('refuses a %s body with 415', (contentType) => {
    expect(() =>
      guard.canActivate(httpContext('POST', { 'content-type': contentType })),
    ).toThrow(UnsupportedMediaTypeException);
  });

  it('leaves sockets alone (they have their own Origin check)', () => {
    const socket = { getType: () => 'ws' } as unknown as ExecutionContext;

    expect(guard.canActivate(socket)).toBe(true);
  });
});
