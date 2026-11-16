import { formatMinutes, formatMinutesCompact } from '../src/lib/formatMinutes';

describe('formatMinutes', () => {
  it('formats fractional minutes cleanly (2.7 min -> 2 min 42 s)', () => {
    expect(formatMinutes(2.7)).toBe('2 min 42 s');
  });

  it('formats whole minutes without seconds (5 min -> 5 min)', () => {
    expect(formatMinutes(5)).toBe('5 min');
  });

  it('formats sub-minute durations in seconds only (0.5 min -> 30 s)', () => {
    expect(formatMinutes(0.5)).toBe('30 s');
  });

  it('formats 0 or negative minutes safely', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(-1.5)).toBe('0 min');
  });

  it('formats compact variants properly', () => {
    expect(formatMinutesCompact(2.7)).toBe('2m 42s');
    expect(formatMinutesCompact(5)).toBe('5m');
    expect(formatMinutesCompact(0.25)).toBe('15s');
  });
});
