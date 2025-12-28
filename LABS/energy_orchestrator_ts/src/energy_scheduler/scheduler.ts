import { SolarGenerationSlot, copySlots } from './solarForecast.js';
import { NotificationEvent, ScheduleResult, ScheduledTask, Task } from './task.js';

export class ScheduleEngine {
  private baseSlots: SolarGenerationSlot[];
  private availableSlots: SolarGenerationSlot[];

  constructor(forecast: Iterable<SolarGenerationSlot>) {
    this.baseSlots = Array.from(forecast).sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
    this.availableSlots = copySlots(this.baseSlots);
  }

  schedule(tasks: Iterable<Task>): ScheduleResult {
    this.availableSlots = copySlots(this.baseSlots);
    const scheduled: ScheduledTask[] = [];
    const unscheduled: Task[] = [];

    for (const task of Array.from(tasks).sort((a, b) => {
      if (a.priority === b.priority) {
        return a.latestEnd.getTime() - b.latestEnd.getTime();
      }
      return b.priority - a.priority;
    })) {
      const assignment = this.allocateTask(task);
      if (assignment) {
        scheduled.push(assignment);
      } else {
        unscheduled.push(task);
      }
    }

    const notifications = this.buildNotifications(scheduled);
    return { scheduled, unscheduled, notifications };
  }

  snoozeAndReschedule(tasks: Task[], taskId: string, delayMs: number): ScheduleResult {
    for (const task of tasks) {
      if (task.taskId === taskId) {
        task.snooze(delayMs);
        break;
      }
    }
    return this.schedule(tasks);
  }

  private allocateTask(task: Task): ScheduledTask | null {
    for (let index = 0; index < this.availableSlots.length; index += 1) {
      const slot = this.availableSlots[index];
      const candidateStart = new Date(Math.max(slot.start.getTime(), task.earliestStart.getTime()));
      if (candidateStart.getTime() + task.durationMs > task.latestEnd.getTime()) {
        continue;
      }
      if (slot.availableKWh <= 0) {
        continue;
      }
      const assignment = this.tryAllocateFromIndex(task, index, candidateStart);
      if (assignment) {
        return assignment;
      }
    }
    return null;
  }

  private tryAllocateFromIndex(
    task: Task,
    startIndex: number,
    startTime: Date
  ): ScheduledTask | null {
    let remainingDuration = task.durationMs;
    const energyRateKw = task.powerDrawKw();
    const slotsUsed: Array<{ index: number; energy: number }> = [];
    let currentIndex = startIndex;
    let currentTime = new Date(startTime);

    while (remainingDuration > 0 && currentIndex < this.availableSlots.length) {
      const slot = this.availableSlots[currentIndex];
      if (slot.start.getTime() > currentTime.getTime()) {
        currentTime = new Date(slot.start);
      }
      if (currentTime >= slot.end || currentTime.getTime() + remainingDuration > task.latestEnd.getTime()) {
        break;
      }

      const usableEnd = new Date(Math.min(slot.end.getTime(), task.latestEnd.getTime()));
      const segmentMs = Math.min(remainingDuration, usableEnd.getTime() - currentTime.getTime());
      const segmentHours = segmentMs / 3_600_000;
      const requiredEnergy = energyRateKw * segmentHours;

      if (slot.availableKWh + 1e-9 < requiredEnergy) {
        break;
      }

      slotsUsed.push({ index: currentIndex, energy: requiredEnergy });
      remainingDuration -= segmentMs;
      currentTime = new Date(slot.end);
      currentIndex += 1;
    }

    if (remainingDuration > 0) {
      return null;
    }

    for (const { index, energy } of slotsUsed) {
      this.availableSlots[index].availableKWh -= energy;
    }

    const endTime = new Date(startTime.getTime() + task.durationMs);
    return { task, start: startTime, end: endTime, energyAllocated: task.energyKWh };
  }

  private buildNotifications(scheduled: Iterable<ScheduledTask>): NotificationEvent[] {
    const notifications: NotificationEvent[] = [];
    for (const assignment of scheduled) {
      if (assignment.task.requiresHuman) {
        const at = new Date(assignment.start.getTime() - assignment.task.notificationLeadMs);
        const message = `Reminder: Start '${assignment.task.name}' at ${assignment.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to use solar power`;
        notifications.push({ taskId: assignment.task.taskId, at, message });
      }
    }
    return notifications.sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
