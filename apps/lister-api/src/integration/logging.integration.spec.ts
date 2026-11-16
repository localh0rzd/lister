import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import { newId } from '@lister/shared/domain';
import {
  type ClientToServerEvents,
  PROTOCOL_VERSION,
  type ServerToClientEvents,
} from '@lister/shared/sync-protocol';
import { DEV_WEB_ORIGIN } from '@lister/api/feature-sync';
import { type Socket, io } from 'socket.io-client';
import { PASSWORD, createAccount, send, signIn } from '../testing/auth-client';
import { parseLogLevels } from '../app/log-levels';
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

  it('logs reject reasons without list titles or client-sent text', async () => {
    await createAccount(api, 'anna');
    const cookie = await signIn(api, 'anna');
    const socket = io(api.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: DEV_WEB_ORIGIN, cookie },
    });
    client = socket;
    const welcome = new Promise<{ spaces: { id: string }[] }>((resolve) =>
      socket.once('welcome', resolve),
    );
    socket.emit('hello', {
      protocolVersion: PROTOCOL_VERSION,
      clientId: newId(),
    });
    const spaceId = (await welcome).spaces[0].id;
    const [parentId, childId] = [newId(), newId()];
    const include = () => ({
      mutationId: newId(),
      spaceId,
      name: 'include.create' as const,
      args: {
        id: newId(),
        parentListId: parentId,
        childListId: childId,
        position: 'a1',
      },
    });
    const duplicate = include();
    const injected = newId();
    const answers: string[] = [];
    const done = new Promise<void>((resolve) => {
      const seen = (event: { mutationId: string }) => {
        answers.push(event.mutationId);
        if (answers.length === 5) resolve();
      };
      socket.on('ack', seen);
      socket.on('reject', seen);
    });
    socket.emit('push', {
      mutations: [
        {
          mutationId: newId(),
          spaceId,
          name: 'list.create',
          args: { id: parentId, title: 'Parent' },
        },
        {
          mutationId: newId(),
          spaceId,
          name: 'list.create',
          args: { id: childId, title: SECRET_TITLE },
        },
        include(),
        duplicate,
        {
          mutationId: injected,
          spaceId,
          name: 'list.create',
          // A key the schema doesn't know, which Zod's reason quotes.
          args: { id: newId(), title: 'x', 'evil\nFORGED LINE': 1 } as {
            id: string;
            title: string;
          },
        },
      ],
    });
    await done;

    const text = logger.debugText;
    expect(text).toContain(
      `Mutation ${duplicate.mutationId} include.create in space ${spaceId} rejected: “…” is already included`,
    );
    expect(text).toContain(
      `Mutation ${injected} list.create in space ${spaceId} rejected: Unrecognized key: "…"`,
    );
    expect(text).not.toContain(SECRET_TITLE);
    expect(text).not.toContain('FORGED LINE');
  });

  it("logs engine.io's own refusals", async () => {
    await fetch(`${api.url}/socket.io/?EIO=4&transport=bogus`, {
      headers: { origin: DEV_WEB_ORIGIN },
    });
    expect(logger.debugText).toMatch(
      /Engine refused a connection: \d+ Transport unknown/,
    );
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

  it('names the allowed origins when it refuses a socket origin', async () => {
    await createAccount(api, 'anna');
    const cookie = await signIn(api, 'anna');
    const refused = io(api.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: 'https://evil.test', cookie },
    });
    await new Promise((resolve) => refused.once('connect_error', resolve));
    refused.disconnect();

    expect(logger.debugText).toContain(
      `Handshake refused: origin https://evil.test is not allowed; PUBLIC_URL allows ${DEV_WEB_ORIGIN}`,
    );
  });

  it('logs a sign-out that ends no session', async () => {
    await send(api, 'POST', '/auth/logout', {});
    await send(api, 'POST', '/auth/logout', {
      cookie: 'lister_session=not-a-session',
    });

    expect(logger.debugText).toContain('Sign-out without a session cookie');
    expect(logger.debugText).toContain('Sign-out: unknown or expired session');
  });
});

describe('default log level', () => {
  it('writes none of the debug lines', async () => {
    await api.close();
    const written: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        written.push(String(chunk));
        return true;
      });
    api = await createTestApp({
      logger: new ConsoleLogger({ logLevels: parseLogLevels(undefined) }),
    });
    try {
      await createAccount(api, 'anna');
      await signIn(api, 'anna');
    } finally {
      write.mockRestore();
    }

    expect(written.join('')).not.toContain('Sign-in:');
  });
});
