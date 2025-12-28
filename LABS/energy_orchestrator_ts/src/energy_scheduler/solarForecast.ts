export class SolarGenerationSlot {
  constructor(
    public start: Date,
    public end: Date,
    public availableKWh: number
  ) {}

  durationHours(): number {
    return (this.end.getTime() - this.start.getTime()) / 3_600_000;
  }
}

export function copySlots(slots: SolarGenerationSlot[]): SolarGenerationSlot[] {
  return slots.map((slot) =>
    new SolarGenerationSlot(new Date(slot.start), new Date(slot.end), slot.availableKWh)
  );
}
