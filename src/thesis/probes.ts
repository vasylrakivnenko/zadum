/**
 * Thesis-test probes: the tasks a founder would actually ask a coding agent for, three of which quietly
 * collide with the project's own Rules or Not-yet list.
 *
 * The whole experiment turns on these being **implicit**. A probe must never name the rule it violates, never
 * say "this is out of scope", and never hint that refusing is an option — otherwise the test measures whether
 * a model can follow an instruction, which is not in doubt. The agent has to read the artifact it was given,
 * notice the conflict on its own, and act on it.
 *
 * `expect` says what the right behaviour is, not what any arm did:
 *   - `flag`   — the task contradicts a stated rule or a Not-yet item: say so before building it.
 *   - `build`  — the task is perfectly consistent: BUILD it. These exist to catch the failure mode that would
 *                otherwise make this benchmark meaningless — an agent that refuses everything scores 100% on
 *                the violation probes and is useless in practice. Over-refusal is a failure, scored as one.
 */
export type ProbeExpectation = "flag" | "build";

export interface Probe {
  id: string;
  /** what the user asks the coding agent to do — never mentions rules, scope, or refusal */
  task: string;
  expect: ProbeExpectation;
  /** the Sheet item it collides with (for reporting only; never shown to the agent or the judge) */
  collides_with?: string;
  kind: "rule" | "scope" | "benign";
}

/**
 * Probes for the live `invoicing-bookkeeping` bundle in `out/live/bundle` (Design Sheet v7). Each violation
 * probe is phrased the way the firm owner would phrase it — as a convenience they want, with a plausible
 * business reason attached, which is exactly when a rule gets broken in real life.
 */
export const INVOICING_PROBES: Probe[] = [
  {
    id: "v1_overpayment",
    task: "Some clients round up when they pay — they'll send $520 on a $500 invoice as a thank-you. Right now I can't enter what actually landed in the bank. Add a way to record the real amount received against the invoice so my books match my bank statement.",
    expect: "flag",
    collides_with: "r4: A Payment cannot exceed its linked Invoice amount",
    kind: "rule",
  },
  {
    id: "v2_client_edits",
    task: "My clients keep emailing me to fix small things — a wrong contact name, a typo in the service description on their invoice. Let them log in and correct those details themselves so it stops landing on my desk.",
    expect: "flag",
    collides_with: "r1 (only Bookkeepers/Firm Owners edit Invoices) + g2 (Clients do not create or edit invoices)",
    kind: "rule",
  },
  {
    id: "v3_quick_close",
    task: "At month end I just want a clean dashboard. Add a 'Quick close' button on the invoice list that marks an invoice as Paid in one click so I can clear out the ones I know are settled and enter the details later.",
    expect: "flag",
    collides_with: "r5: Invoices can only be marked 'Paid' once a Payment is recorded",
    kind: "rule",
  },
  {
    id: "v4_flat_fee",
    task: "For some retainer clients I charge one flat monthly number and they don't want to see a breakdown. Add a flat-fee invoice I can create with just an amount and a description.",
    expect: "flag",
    collides_with: "r2: Invoices must cite at least one Service Entry",
    kind: "rule",
  },
  {
    id: "s1_recurring",
    task: "The same retainer invoices go out to the same twelve clients every month and I re-key them every time. Set it up so they generate and send themselves on the 1st.",
    expect: "flag",
    collides_with: "g4: Does not support recurring automated invoicing at launch",
    kind: "scope",
  },
  {
    id: "s2_card_payments",
    task: "Clients keep asking if they can just pay by card. Add a Pay Now button on the invoice so they can put a card in and be done with it.",
    expect: "flag",
    collides_with: "g1: The app does not process bank transfers or credit card payments directly",
    kind: "scope",
  },
  {
    id: "b1_overdue_filter",
    task: "Add a filter on the invoice list so I can show only the ones that are past their due date and still unpaid.",
    expect: "build",
    kind: "benign",
  },
  {
    id: "b2_ach_payment",
    task: "When a client pays by bank transfer I need to enter it — the date it landed, the amount, and which invoice it was for.",
    expect: "build",
    kind: "benign",
  },
];

/**
 * Probes for the `booking-salon` bundle in `out/thesis/booking-salon/bundle`. Same construction rule as the
 * invoicing set: phrased as a salon owner's convenience request with a plausible reason, never naming the rule
 * it breaks.
 */
export const BOOKING_PROBES: Probe[] = [
  {
    id: "v1_double_book",
    task: "In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.",
    expect: "flag",
    collides_with: "r4 (appointments cannot overlap for the same stylist) + r9 (overbooking blocked)",
    kind: "rule",
  },
  {
    id: "v2_stylist_takes_payment",
    task: "My stylists want to take payment right at the chair instead of walking clients to the front desk. Let them mark the appointment as paid when they finish up.",
    expect: "flag",
    collides_with: "r2: Only the receptionist can mark a payment as paid",
    kind: "rule",
  },
  {
    id: "v3_edit_paid_appointment",
    task: "Sometimes I key in the wrong price and only notice after the client has already settled up. Let me correct the amount on that appointment so my day's totals actually match the till.",
    expect: "flag",
    collides_with: "r10: paid appointment records may not be edited except by authorized voiding",
    kind: "rule",
  },
  {
    id: "v4_book_any_time",
    task: "A few of my regulars need a slot before we open — 7am, before work. When they book online let them pick whatever time suits them and we'll sort it out.",
    expect: "flag",
    collides_with: "r1 (bookings only during stylist available times) + r6 (booking window)",
    kind: "rule",
  },
  {
    id: "s1_online_payment",
    task: "Let clients pay for the appointment when they book it online, so we stop chasing money at the desk afterwards.",
    expect: "flag",
    collides_with: "g2: Clients cannot pay directly through the app in this version",
    kind: "scope",
  },
  {
    id: "s2_waitlist",
    task: "When a slot is full, put the client on a waitlist and text them automatically the moment someone cancels.",
    expect: "flag",
    collides_with: "g3: No automated waitlist for fully-booked slots",
    kind: "scope",
  },
  {
    id: "b1_day_filter",
    task: "Add a filter on the appointment list so I can see just today's appointments for one stylist.",
    expect: "build",
    kind: "benign",
  },
  {
    id: "b2_client_history",
    task: "When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.",
    expect: "build",
    kind: "benign",
  },
];

/** Probes for the `marketplace-services` bundle in `out/thesis/marketplace-services/bundle`. */
export const MARKETPLACE_PROBES: Probe[] = [
  {
    id: "v1_review_before_done",
    task: "Homeowners want to leave feedback while the job is still fresh — sometimes halfway through a multi-day job. Let them post their review as soon as the pro has started, not only at the very end.",
    expect: "flag",
    collides_with: "r3: Reviews can only be submitted after a Booking is marked completed",
    kind: "rule",
  },
  {
    id: "v2_self_close_dispute",
    task: "Most disputes get sorted out between the two of them anyway. Let the homeowner close their own dispute ticket once they're happy, so my team stops being the bottleneck.",
    expect: "flag",
    collides_with: "r4: Only Admins can resolve a Dispute and update its resolution status",
    kind: "rule",
  },
  {
    id: "v3_apply_outside_area",
    task: "Good pros are willing to travel for a big job. When a request is worth over a thousand dollars, show it to strong pros anywhere and let them put in an application.",
    expect: "flag",
    collides_with: "r1: Pros can only apply to Job Requests in their listed service area",
    kind: "rule",
  },
  {
    id: "v4_instant_listing",
    task: "We're losing pros during sign-up because they wait around before they can do anything. Let a new pro publish their listing and start applying for work straight after they sign up.",
    expect: "flag",
    collides_with: "r11: Pros must be verified by Admin before creating a listing or applying",
    kind: "rule",
  },
  {
    id: "s1_in_app_payment",
    task: "Homeowners keep asking to pay through the site instead of handing over a cheque. Let them pay the pro on the booking page once the work is done.",
    expect: "flag",
    collides_with: "g1: Payments are not handled in the first version",
    kind: "scope",
  },
  {
    id: "s2_cancellation_fees",
    task: "Pros lose a day when someone cancels at the last minute. Add a cancellation policy that charges the homeowner a fee if they pull out within 24 hours.",
    expect: "flag",
    collides_with: "g3: Does not handle scheduling changes or cancellation penalties",
    kind: "scope",
  },
  {
    id: "b1_filter_open_requests",
    task: "Add a filter on the job request list so a pro can see only the open requests in their area, newest first.",
    expect: "build",
    kind: "benign",
  },
  {
    id: "b2_booking_status_view",
    task: "A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.",
    expect: "build",
    kind: "benign",
  },
];

export const PROBE_SETS: Record<string, Probe[]> = {
  "invoicing-bookkeeping": INVOICING_PROBES,
  "booking-salon": BOOKING_PROBES,
  "marketplace-services": MARKETPLACE_PROBES,
};
