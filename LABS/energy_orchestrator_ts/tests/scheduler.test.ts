import { describe, expect, it } from 'vitest';
import { ScheduleEngine } from '../src/energy_scheduler/scheduler.js';
import { SolarGenerationSlot } from '../src/energy_scheduler/solarForecast.js';
import { Task } from '../src/energy_scheduler/task.js';

function dateAt(hour: number, minute = 0): Date {
  const base = new Date('2023-01-01T00:00:00Z');
  base.setUTCHours(hour, minute, 0, 0);
  return base;
}

describe('ScheduleEngine', () => {
  it('allocates tasks by priority within solar forecast', () => {
    const forecast = [
      new SolarGenerationSlot(dateAt(9), dateAt(10), 3),
      new SolarGenerationSlot(dateAt(10), dateAt(12), 4)
    ];
    const engine = new ScheduleEngine(forecast);

    const laundry = new Task('laundry', 'Laundry', 2, 60 * 60 * 1000, dateAt(9), dateAt(12), 2);
    const dishwasher = new Task('dishwasher', 'Dishwasher', 3, 60 * 60 * 1000, dateAt(9), dateAt(12), 1, true);
    const carCharge = new Task('car', 'EV Charge', 4, 2 * 60 * 60 * 1000, dateAt(10), dateAt(13), 0);

    const result = engine.schedule([carCharge, dishwasher, laundry]);

    expect(result.scheduled.map((s) => s.task.taskId)).toEqual(['laundry', 'dishwasher', 'car']);
    expect(result.unscheduled).toHaveLength(0);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].taskId).toBe('dishwasher');
    expect(result.notifications[0].at.getTime()).toBe(
      result.scheduled.find((s) => s.task.taskId === 'dishwasher')!.start.getTime() -
        dishwasher.notificationLeadMs
    );
  });

  it('reschedules when a task is snoozed', () => {
    const forecast = [new SolarGenerationSlot(dateAt(9), dateAt(12), 6)];
    const engine = new ScheduleEngine(forecast);

    const laundry = new Task('laundry', 'Laundry', 3, 90 * 60 * 1000, dateAt(9), dateAt(12), 1, true);
    const dishwasher = new Task('dishwasher', 'Dishwasher', 2, 60 * 60 * 1000, dateAt(9), dateAt(12), 0);

    const initial = engine.schedule([laundry, dishwasher]);
    expect(initial.scheduled[0].start).toEqual(dateAt(9));

    const delayed = engine.snoozeAndReschedule([laundry, dishwasher], 'laundry', 30 * 60 * 1000);
    expect(delayed.scheduled.find((s) => s.task.taskId === 'laundry')?.start).toEqual(dateAt(9, 30));
    expect(delayed.notifications[0].at.getTime()).toBe(
      delayed.scheduled[0].start.getTime() - laundry.notificationLeadMs
    );
  });

  it('leaves tasks unscheduled when solar is insufficient', () => {
    const forecast = [new SolarGenerationSlot(dateAt(9), dateAt(10), 1)];
    const engine = new ScheduleEngine(forecast);

    const heavyTask = new Task('heavy', 'Heavy Load', 2, 60 * 60 * 1000, dateAt(9), dateAt(11), 1);
    const lightTask = new Task('light', 'Light Load', 0.5, 30 * 60 * 1000, dateAt(9), dateAt(11), 0);

    const result = engine.schedule([heavyTask, lightTask]);

    expect(result.scheduled.map((s) => s.task.taskId)).toEqual(['light']);
    expect(result.unscheduled.map((t) => t.taskId)).toEqual(['heavy']);
  });
});
