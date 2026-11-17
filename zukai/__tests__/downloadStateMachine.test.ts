/**
 * Test: Download State Machine & Concurrency Limiter
 * Location: /zukai/__tests__/downloadStateMachine.test.ts
 */

import { withDownloadConcurrency } from '../src/features/playback/downloadManager';

describe('Download Concurrency Limiter', () => {
  it('allows up to 2 concurrent tasks and queues subsequent tasks', async () => {
    let activeTasks = 0;
    let maxObservedActive = 0;
    const executionOrder: number[] = [];

    const createTask = (id: number, delayMs: number) => {
      return withDownloadConcurrency(async () => {
        activeTasks++;
        if (activeTasks > maxObservedActive) {
          maxObservedActive = activeTasks;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));

        executionOrder.push(id);
        activeTasks--;
        return id;
      });
    };

    const task1 = createTask(1, 30);
    const task2 = createTask(2, 30);
    const task3 = createTask(3, 10);
    const task4 = createTask(4, 10);

    await Promise.all([task1, task2, task3, task4]);

    // Maximum concurrent tasks should strictly be <= 2
    expect(maxObservedActive).toBeLessThanOrEqual(2);
    expect(executionOrder).toHaveLength(4);
  });
});
