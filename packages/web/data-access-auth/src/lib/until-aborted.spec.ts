import { untilAborted } from './until-aborted';

describe('untilAborted', () => {
  it('gives the answer when there is no signal', async () => {
    expect(await untilAborted(Promise.resolve(1), undefined)).toBe(1);
  });

  it('gives the answer, or the failure, of the promise while not aborted', async () => {
    const signal = new AbortController().signal;
    expect(await untilAborted(Promise.resolve('ok'), signal)).toBe('ok');
    await expect(
      untilAborted(Promise.reject(new Error('boom')), signal),
    ).rejects.toThrow('boom');
  });

  it('rejects as soon as the signal aborts, though the promise never settles', async () => {
    const controller = new AbortController();
    const waiting = untilAborted(
      new Promise(() => undefined),
      controller.signal,
    );
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects at once when the signal was aborted already', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      untilAborted(Promise.resolve(1), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
