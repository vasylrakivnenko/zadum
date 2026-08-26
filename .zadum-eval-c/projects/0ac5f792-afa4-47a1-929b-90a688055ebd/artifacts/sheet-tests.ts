// Generated from Design Sheet v6 (booking system for my hair salon so clients can book online instead of calling).
// Do not rename tests: the "r…:"/"a…:" prefixes are the Sheet's stable rule/action ids — they are how
// reviews trace test coverage back to the Sheet. Implement each todo against the real app; a rule test
// must FAIL if the rule can be violated.
import { describe, it } from "vitest";

describe("Design Sheet rules (inviolable)", () => {
  it.todo("r1 (integrity): An appointment can only be booked in a time slot when the chosen stylist is working and not already booked.");
  it.todo("r2 (integrity): An appointment cannot be booked during a stylist's time off.");
  it.todo("r3 (scope): A stylist can only be booked for services they offer.");
  it.todo("r4 (state): Appointments cannot be booked in the past or outside salon opening hours.");
  it.todo("r5 (access): Clients may only view and change their own appointments, not others'.");
  it.todo("r6 (state): Cancellations must happen before the appointment start time.");
  it.todo("r7 (access): Only staff may edit services, stylist profiles, and working hours.");
  it.todo("r8 (integrity): Each appointment must have exactly one client, one stylist, and one service.");
  it.todo("r9 (integrity): Removing a Service or Stylist Profile must not silently break existing Appointments — related upcoming Appointments should be reassigned or cancelled rather than left pointing at a missing stylist or service.");
  it.todo("r10 (state): Cancellations and reschedules made too close to the appointment start (within a salon-configured cut-off) may be blocked or flagged, not just any time before start.");
  it.todo("r11 (integrity): A Cancellation must record who cancelled it and a reason before it is completed.");
  it.todo("r12 (state): A newly booked Appointment stays in a tentative/pending status until confirmed, and is not treated as final until then.");
  it.todo("r13 (state): Staff must be able to mark an Appointment as attended or a no-show, and no-show handling is tracked against the Client Record.");
  it.todo("r5 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r7 negative: the forbidden path is actually blocked — attempt it and assert denial");
});

describe("Actions (happy paths)", () => {
  it.todo("a1: Client books Appointment — e.g. Sarah books Cut & Blow-dry with Maria for Mar 12 at 2:00pm");
  it.todo("a2: Client cancels Appointment — e.g. Sarah cancels her Mar 12 appointment");
  it.todo("a3: Client reschedules Appointment — e.g. Sarah moves her appointment to Mar 14 at 3:00pm");
  it.todo("a4: Client updates Client Record — e.g. Sarah updates her phone number");
  it.todo("a5: Receptionist books Appointment — e.g. Receptionist books a walk-in for Tom with Maria");
  it.todo("a6: Receptionist cancels Appointment — e.g. Receptionist cancels a no-show appointment");
  it.todo("a7: Stylist sets Time Off — e.g. Maria blocks Mar 20–24 for holiday");
  it.todo("a8: Stylist views Appointment — e.g. Maria checks her bookings for the day");
  it.todo("a9: Salon Manager adds Service — e.g. Manager adds Balayage, 2 hours, $150");
  it.todo("a10: Salon Manager edits Stylist Profile — e.g. Manager sets which services Maria offers");
  it.todo("a11: Salon Manager sets Working Hours — e.g. Manager sets salon hours Tue–Sat 9–6");
  it.todo("a12: Salon Manager sends Reminder — e.g. System sends Sarah a text the night before");
});

// Not-yet (scope guard) — these features must NOT exist; a test asserting their absence is optional but welcome:
//   g1: Does not take payments or deposits online at time of booking.
//   g2: Does not sell retail products or gift cards.
//   g3: Does not manage stylist payroll or commissions.
//   g4: Does not include a loyalty or points program.
//   g5: Does not handle group or multi-person party bookings in one slot.
