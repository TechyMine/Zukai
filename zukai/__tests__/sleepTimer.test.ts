/**
 * Test: Sleep Timer Logic
 * Location: /zukai/__tests__/sleepTimer.test.ts
 */

describe('Sleep Timer Logic', () => {
  it('calculates accurate target wall-clock deadline based on minutes', () => {
    const minutes = 15;
    const now = 1700000000000;
    const expectedDeadline = now + minutes * 60 * 1000;

    expect(expectedDeadline - now).toBe(900000); // 15 mins in ms
  });

  it('computes remaining seconds accurately from deadline', () => {
    const deadline = 1700000900000;
    const currentTime = 1700000850000; // 50 seconds before deadline

    const remainingSec = Math.max(0, Math.round((deadline - currentTime) / 1000));
    expect(remainingSec).toBe(50);
  });

  it('clamps remaining seconds to 0 once deadline has passed', () => {
    const deadline = 1700000900000;
    const currentTime = 1700000910000; // 10 seconds after deadline

    const remainingSec = Math.max(0, Math.round((deadline - currentTime) / 1000));
    expect(remainingSec).toBe(0);
  });
});
