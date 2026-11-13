import { type AccountEvent, AccountEvents } from './account-events';

describe('AccountEvents', () => {
  it('tells every listener, synchronously, until it unsubscribes', () => {
    const events = new AccountEvents();
    const first: AccountEvent[] = [];
    const second: AccountEvent[] = [];
    const unsubscribe = events.subscribe((event) => first.push(event));
    events.subscribe((event) => second.push(event));

    events.emit({ kind: 'sessionsEnded', userId: 'anna' });
    unsubscribe();
    events.emit({ kind: 'membersChanged', userIds: ['ben'] });

    expect(first).toEqual([{ kind: 'sessionsEnded', userId: 'anna' }]);
    expect(second).toEqual([
      { kind: 'sessionsEnded', userId: 'anna' },
      { kind: 'membersChanged', userIds: ['ben'] },
    ]);
  });
});
