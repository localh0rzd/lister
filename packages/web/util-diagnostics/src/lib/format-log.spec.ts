import { formatEntry, formatReport, reportFilename } from './format-log';

const AT = Date.UTC(2026, 10, 18, 10, 0, 0, 123);

describe('formatEntry', () => {
  it('writes time, tab, name and data on one line', () => {
    expect(
      formatEntry({
        at: AT,
        area: 'socket',
        event: 'connect',
        tab: 'abc',
        leader: true,
        data: { sid: 's1', n: 2 },
      }),
    ).toBe(
      '2026-11-18T10:00:00.123Z [abc *] socket.connect {"sid":"s1","n":2}',
    );
  });

  it('leaves out the leader mark and empty data', () => {
    expect(
      formatEntry({
        at: AT,
        area: 'net',
        event: 'offline',
        tab: 'abc',
        leader: false,
      }),
    ).toBe('2026-11-18T10:00:00.123Z [abc] net.offline');
  });
});

describe('formatReport', () => {
  it('starts with the header, then the entries', () => {
    const text = formatReport({ onLine: 'true' }, [
      { at: AT, area: 'net', event: 'online', tab: 't', leader: false },
    ]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('# Lister diagnostic log');
    expect(lines).toContain('# onLine: true');
    expect(lines.at(-2)).toBe('2026-11-18T10:00:00.123Z [t] net.online');
  });

  it('keeps a value over several lines inside the header', () => {
    const text = formatReport(
      { serviceWorkerState: 'NGSW Debug Info:\n\nDriver state: NORMAL' },
      [],
    );
    expect(text.split('\n').slice(1, 4)).toEqual([
      '# serviceWorkerState: NGSW Debug Info:',
      '#   ',
      '#   Driver state: NORMAL',
    ]);
  });
});

it('names the file with the date', () => {
  expect(reportFilename(new Date(AT))).toBe('lister-diagnostic-2026-11-18.log');
});
