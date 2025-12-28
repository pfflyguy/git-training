export class Task {
  constructor(
    public taskId: string,
    public name: string,
    public energyKWh: number,
    public durationMs: number,
    public earliestStart: Date,
    public latestEnd: Date,
    public priority = 0,
    public requiresHuman = false,
    public canAdjustWindow = true,
    public notificationLeadMs = 30 * 60 * 1000
  ) {}

  powerDrawKw(): number {
    return this.energyKWh / (this.durationMs / 3_600_000);
  }

  snooze(delayMs: number): void {
    this.earliestStart = new Date(this.earliestStart.getTime() + delayMs);
    if (this.canAdjustWindow) {
      this.latestEnd = new Date(this.latestEnd.getTime() + delayMs);
    }
  }

  isWithinWindow(start: Date, end: Date): boolean {
    return start >= this.earliestStart && end <= this.latestEnd;
  }
}

export interface ScheduledTask {
  task: Task;
  start: Date;
  end: Date;
  energyAllocated: number;
}

export interface NotificationEvent {
  taskId: string;
  at: Date;
  message: string;
}

export interface ScheduleResult {
  scheduled: ScheduledTask[];
  unscheduled: Task[];
  notifications: NotificationEvent[];
}
