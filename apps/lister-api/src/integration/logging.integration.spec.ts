import type { LoggerService } from '@nestjs/common';
import { newId } from '@lister/shared/domain';
import {
  type ClientToServerEvents,
  PROTOCOL_VERSION,
  type ServerToClientEvents,
} from '@lister/shared/sync-protocol';
import { DEV_WEB_ORIGIN } from '@lister/api/feature-sync';
import { type Socket, io } from 'socket.io-client';
import { PASSWORD, createAccount, send, signIn } from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

/** Collects what the app logs, per level. */
class CollectingLogger implements LoggerService {
  readonly lines: { level: string; text: string }[] = [];
  log = (message: unknown) => this.add('log', message);
  error = (message: unknown) => this.add('error', message);
  warn = (message: unknown) => this.add('warn', message);
  debug = (message: unknown) => this.add('debug', message);
  private add(level: string, message: unknown) {
    this.lines.push({ level, text: String(message) });
  }
  get debugText(): string {
    return this.lines
      .filter((line) => line.level === 'debug')
      .map((line) => line.text)
      .join('\n');
  }
}

const SECRET_TITLE = 'My secret packing list';
let api: TestApp;
let logger: CollectingLogger;
let client: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

beforeEach(async () => {
  logger = new CollectingLogger();
  api = await createTestApp({ logger });
});
afterEach(async () => {
  client?.disconnect();
  client = undefined;
  await api.close();
});

describe('debug logging', () => {
  it('logs sign-in, the socket, a pull and a push as summaries, with nothing secret', async () => {
    const anna = await createAccount(api, 'anna');
    const cookie = await signIn(api, 'anna');

    client = io(api.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: DEV_WEB_ORIGIN, cookie },
    });
    const welcome = new Promise<{ spaces: { id: string }[] }>((resolve) =>
      client!.once('welcome', resolve),
    );
    client.emit('hello', {
      protocolVersion: PROTOCOL_VERSION,
      clientId: newId(),
    });
    const space = (await welcome).spaces[0].id;
    const rows = new Promise((resolve) => client!.once('rows', resolve));
    client.emit('pull', { spaceId: space, since: 0, timeline: '' });
    await rows;
    const ack = new Promise((resolve) => client!.once('ack', resolve));
    const mutationId = newId();
    client.emit('push', {
      mutations: [
        {
          mutationId,
          spaceId: space,
          name: 'list.create',
          args: { id: newId(), title: SECRET_TITLE },
        },
      ],
    });
    await ack;
    client.disconnect();
    await vi.waitFor(() => expect(logger.debugText).toMatch(/disconnected/));

    const text = logger.debugText;
    expect(text).toContain(`Sign-in: user ${anna.id}`);
    expect(text).toContain(`Handshake accepted: user ${anna.id}`);
    expect(text).toMatch(/Socket \S+ connected/);
    expect(text).toMatch(/Hello from \S+: user .+, protocol/);
    expect(text).toMatch(/Welcome to \S+: user .+, \d+ space\(s\)/);
    expect(text).toContain(`space ${space}, since 0, snapshot, 0 row(s)`);
    expect(text).toContain('Push from');
    expect(text).toContain(
      `Mutation ${mutationId} list.create in space ${space} acked at version 1`,
    );
    expect(text).toMatch(
      /Socket \S+ disconnected: client namespace disconnect/,
    );

    const everything = logger.lines.map((line) => line.text).join('\n');
    for (const secret of [
      PASSWORD,
      SECRET_TITLE,
      cookie,
      cookie.split('=')[1],
    ]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('logs a rejected mutation with its reason and a refused handshake with its cause', async () => {
    await createAccount(api, 'anna');
    const cookie = await signIn(api, 'anna');
    client = io(api.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: DEV_WEB_ORIGIN, cookie },
    });
    const welcome = new Promise<{ spaces: { id: string }[] }>((resolve) =>
      client!.once('welcome', resolve),
    );
    client.emit('hello', {
      protocolVersion: PROTOCOL_VERSION,
      clientId: newId(),
    });
    const space = (await welcome).spaces[0].id;
    const reject = new Promise((resolve) => client!.once('reject', resolve));
    const mutationId = newId();
    client.emit('push', {
      mutations: [
        {
          mutationId,
          spaceId: space,
          name: 'list.update',
          args: { id: newId(), patch: { title: 'x' } },
        },
      ],
    });
    await reject;

    const refused = io(api.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: DEV_WEB_ORIGIN },
    });
    await new Promise((resolve) => refused.once('connect_error', resolve));
    refused.disconnect();

    expect(logger.debugText).toMatch(
      new RegExp(
        `Mutation ${mutationId} list\\.update in space \\S+ rejected: .+`,
      ),
    );
    expect(logger.debugText).toContain('Handshake refused: no session cookie');
  });

  it('logs sign-out and a wrong password', async () => {
    const anna = await createAccount(api, 'anna');
    await send(api, 'POST', '/auth/login', {
      body: { username: 'anna', password: 'wrong password!' },
    });
    const cookie = await signIn(api, 'anna');
    await send(api, 'POST', '/auth/logout', { cookie });

    expect(logger.debugText).toContain(
      'Sign-in refused: wrong username or password',
    );
    expect(logger.debugText).toContain(`Sign-out: user ${anna.id}`);
    expect(logger.debugText).not.toContain('wrong password!');
  });
});
