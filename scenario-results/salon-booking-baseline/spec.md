> ⚠️ **NOT DELIVERABLE — 1 gate(s) failed.** the critic returned fail (score 6).
>
> The Design Sheet (`design-sheet.md`) remains the source of truth. Fix these and recompile; do not resolve a contradiction by choosing one side of it.

> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** The critic returned `fail` (score 6) after 6 violation(s) and 3 omission(s) survived the repair pass.
>
> Do not treat it as the source of truth. The Design Sheet (`design-sheet.md`) still is; fix the findings below (full list in `compile-report.json`) and recompile.
>
> - r1 × r12 (high) at "Rules R-1 and R-12; R-12 text 'when the target slot is free at booking it is confirmed instantly, otherwise it stays pending until confirmed' vs R-1 'may be committed for a time slot only when the chosen Stylist … has no other non-cancelled Appointment overlapping'": For a non-free slot the two rules disagree about the same state: R-12 says the Appointment persists as 'pending', while R-1 (and AS-5) says the booking is 'rejected as the slot is not free.' A non-free booking cannot both persist pending and be rejected — neither outcome satisfies both rules.

# Specification — booking system for my hair salon so clients can book online instead of calling

_Compiled from Design Sheet v6 (booking). Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._

**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.

## Overview

Salon Book is an online booking system for a single hair salon, letting clients reserve stylist time over the web instead of phoning the front desk. ⟨src: d:booking_locations⟩ It serves four roles: Clients who book and manage their own visits, Stylists who provide services on their own schedules, the Salon Manager who runs the salon, and Receptionists who handle walk-ins and phone bookings. ⟨src: p:p1, p:p2, p:p3, p:p4⟩ Everyone signs in with an email and password; Clients get their own portal account, and staff are invited by an admin. ⟨src: d:identity_provider, d:external_access, d:invite_flow⟩

### Core value loop

1. A Client signs in and browses the salon's Service menu, each Service carrying its own duration and price. ⟨src: n:n2, d:booking_service_catalog⟩
2. The Client picks a Service and a Stylist who offers it, then chooses an open time slot; slots come from the intersection of salon hours, that Stylist's Working Hours, and their Time Off. ⟨src: a:a1, r:r3, d:booking_availability_rules, n:n4, n:n6, d:x4⟩
3. The Appointment is confirmed instantly when the slot is free, held under a short lock while the Client completes booking to prevent two Clients taking the same slot. ⟨src: d:booking_confirmation, r:r1, d:x2⟩
4. Receptionists also add walk-in and phone bookings, and Stylists block their own Time Off, all against the same availability. ⟨src: a:a5, a:a7, d:booking_walk_ins⟩
5. Before each Appointment the salon sends the Client a reminder by email and SMS; staff mark whether the Client attended or was a no-show, tracked against the Client Record. ⟨src: n:n8, a:a12, d:booking_reminders, r:r13⟩
6. The Salon Manager reviews a dashboard of today's totals — total bookings, no-shows, and busiest stylists — as simple counts. ⟨src: d:reporting⟩

### Platform and scale

The app runs in a web browser, designed mobile-first for phone use. ⟨src: d:platform⟩ It is built for a single salon at one physical location, operating in one language, one country, and one time zone. ⟨src: d:booking_locations, d:localization, d:booking_time_zones⟩ Data volume is expected in the tens of thousands of records. ⟨src: d:data_scale⟩ There is no integration with external tools or calendars; the app is the calendar of record. ⟨src: d:integrations, d:booking_calendar_sync⟩

### Accounts and tenancy

Several people log in with different powers: an owner/admin tier (Salon Manager) plus staff (Receptionist, Stylist) with fewer powers, and Clients on a self-service portal. ⟨src: d:user_accounts, d:roles, d:external_access⟩ Additional staff and stylists are added by an admin invitation rather than open self-signup. ⟨src: d:invite_flow⟩ Deleted records are archived and can be restored rather than erased, and a basic audit trail records who created or updated each record and when. ⟨src: d:deletion, d:audit_trail⟩ Personal Client data (name, phone, email) is treated as sensitive and kept until someone deletes it. ⟨src: d:compliance_sensitivity, d:retention⟩ The salon may apply its own branding — logo, colours, wording — but the workflow itself is fixed. ⟨src: d:customization⟩

### Out of scope for this version

This version does not take payments or deposits online at booking; services are free at booking or paid in person. ⟨src: g:g1, d:booking_prepayment⟩ It does not sell retail products or gift cards, manage stylist payroll or commissions, or run a loyalty/points program. ⟨src: g:g2, g:g3, g:g4⟩ It does not handle group or multi-person party bookings — every slot holds exactly one 1:1 Appointment. ⟨src: g:g5, d:booking_slot_capacity⟩ Recurring booking series are also excluded; each Appointment is made separately. ⟨src: d:booking_recurring⟩

## Actors & permissions

The salon runs a single location, so every permission below is scoped to that one salon and its four logged-in roles: Client, Stylist, Receptionist, and Salon Manager. ⟨src: d:booking_locations, d:roles⟩

### Permission matrix

Each cell is exactly `✓` (allowed), `✗` (denied), or `✓*` (allowed only under the numbered condition below the table).

| Action | Client | Stylist | Receptionist | Salon Manager |
|---|---|---|---|---|
| Book Appointment | ✓ | ✗ | ✓ | ✓ |
| Cancel Appointment | ✓*¹ | ✗ | ✓ | ✓ |
| Reschedule Appointment | ✓*¹ | ✗ | ✓ | ✓ |
| Restore cancelled Appointment | ✗ | ✗ | ✓*² | ✓*² |
| Confirm Appointment | ✓*³ | ✗ | ✓ | ✓ |
| Mark Appointment attended / no-show | ✗ | ✓*⁴ | ✓ | ✓ |
| View Appointment | ✓*⁵ | ✓*⁶ | ✓ | ✓ |
| Update Client Record | ✓*⁷ | ✗ | ✓ | ✓ |
| Set Time Off | ✗ | ✓*⁸ | ✗ | ✓ |
| Set Working Hours | ✗ | ✓*⁸ | ✗ | ✓ |
| Add / edit Service | ✗ | ✗ | ✗ | ✓ |
| Edit Stylist Profile | ✗ | ✗ | ✗ | ✓ |
| Send Reminder | ✗ | ✗ | ✗ | ✓ |
| Reassign Appointments from a removed Stylist | ✗ | ✗ | ✓ | ✓ |
| Archive (soft-delete) Service / Stylist Profile | ✗ | ✗ | ✗ | ✓ |
| Restore archived record | ✗ | ✗ | ✗ | ✓ |
| Override booking constraints (with warning) | ✗ | ✗ | ✓*⁹ | ✓*⁹ |
| Export data (CSV) | ✗ | ✗ | ✗ | ✓ |
| Import spreadsheet (one-time) | ✗ | ✗ | ✗ | ✓ |
| View dashboard (totals & counts) | ✗ | ✗ | ✗ | ✓ |
| Invite user | ✗ | ✗ | ✗ | ✓ |
| Approve booking request | ✗ | ✗ | ✗ | ✗ |
| Comment / add private notes | ✗ | ✗ | ✗ | ✗ |
| View audit trail | ✗ | ✗ | ✗ | ✗ |

### Conditional notes

1. A Client may cancel or reschedule only an Appointment where they are the client, and only before the salon-configured cut-off; inside the cut-off, and after the appointment start time, the request is blocked. ⟨src: a2, a3, r5, r6, r10⟩
2. Restore succeeds only when the original time slot is still open; if the slot has since been taken, restore fails and the record stays cancelled. ⟨src: x5⟩
3. A Client may confirm only their own Appointment, and only from the reminder message; they have no other confirm control. ⟨src: r12, d:booking_reminders⟩
4. A Stylist may mark attended or no-show only on Appointments where they are the assigned stylist. ⟨src: r13, a8⟩
5. A Client may view only Appointments where they are the client. ⟨src: r5⟩
6. A Stylist may view only Appointments where they are the assigned stylist. ⟨src: a8, r5⟩
7. A Client may update only their own Client Record. ⟨src: a4, r5⟩
8. A Stylist may set Time Off and Working Hours only for themselves; the Salon Manager may set them for any stylist. ⟨src: a7, a11, d:booking_staff_schedule_control⟩
9. A Receptionist or Salon Manager may override r1 (stylist already booked / double-book), r2 (during Time Off), r4 (in the past or outside opening hours), and r10 (inside the cut-off) at booking, cancel, or reschedule time; each override is recorded with a warning. r6 (cancel before the appointment start time) is never overridable. ⟨src: x6, r1, r2, r4, r6, r10⟩

### Rows denied to everyone

- Approve booking request is denied to all roles because a free slot is confirmed instantly with no approval step. ⟨src: d:booking_confirmation⟩
- Comment / add private notes is denied to all roles; the Client Record holds contact details and visit history only, with no note or attachment feature in v1. ⟨src: d:booking_customer_records, d:attachments⟩
- View audit trail is denied to all roles; v1 stores only created/updated-by-whom-and-when stamps on each record and exposes no viewable change history. ⟨src: d:audit_trail⟩

### Action provenance

- Book Appointment covers a Client booking for themselves and staff booking on behalf of a client. ⟨src: a1, a5⟩
- Cancel Appointment covers the Client cancelling their own and staff cancelling any. ⟨src: a2, a6⟩
- Reschedule Appointment is the Client moving their own and staff moving any. ⟨src: a3⟩
- Set Time Off, Set Working Hours, Add / edit Service, Edit Stylist Profile, and Send Reminder are the staff configuration actions. ⟨src: a7, a11, a9, a10, a12⟩
- Reassign Appointments from a removed Stylist implements forced reassignment so existing bookings never point at a missing stylist. ⟨src: x1, r9⟩

### Data-visibility boundaries

- A Client sees only their own Client Record and only Appointments where they are the client; they never see other clients' bookings, and they never reach Service, Stylist Profile, Working Hours, dashboard, export, or invite screens. ⟨src: r5, r7⟩
- A Stylist sees only Appointments assigned to them and their own Time Off and Working Hours; they do not see other stylists' client lists or any Salon Manager screen. ⟨src: a8, d:booking_staff_schedule_control⟩
- A Receptionist sees all Appointments, all Client Records, all stylist schedules, and all open slots at the salon, but cannot edit Services, Stylist Profiles, or Working Hours, and cannot open the dashboard, export, import, or invite screens. ⟨src: a5, a6, r7⟩
- A Salon Manager sees every record at the single location and reaches every screen. ⟨src: d:booking_locations, d:roles⟩

These boundaries match the matrix cell for cell: any `✗` above corresponds to a screen or record the role cannot open, and any `✓*` corresponds to the own-record scoping stated in its note. ⟨src: r5, r7⟩

## Data model

The data model has nine persistent entities plus a salon-wide configuration record. All entities use a system-generated UUID primary key (`id`) unless stated otherwise ⟨src: default⟩. All times are stored in a single salon-local time zone; no per-user zone is stored ⟨src: d:booking_time_zones⟩. Prices and money are stored as a single-currency positive decimal; there are no negative or signed money fields in v1 ⟨src: d:booking_pricing_variation, d:localization, g:g1⟩.

### Common fields (every entity)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | System-generated primary key ⟨src: default⟩ |
| created_at | timestamp | yes | Set on insert ⟨src: d:audit_trail⟩ |
| created_by | UUID → Account | yes | Actor who created the row ⟨src: d:audit_trail⟩ |
| updated_at | timestamp | yes | Set on every write ⟨src: d:audit_trail⟩ |
| updated_by | UUID → Account | yes | Actor of the last write ⟨src: d:audit_trail⟩ |
| archived_at | timestamp | no | Non-null means soft-deleted; row is hidden from normal lists and can be restored ⟨src: d:deletion⟩ |

Deletion is always soft: rows are archived (set `archived_at`) and can be restored, never physically removed in v1 ⟨src: d:deletion⟩. Data is retained until someone archives it; there is no automatic time-based purge ⟨src: d:retention⟩.

### Account

Login identity for every human user. One account per person; clients, stylists, receptionists, and the salon manager all authenticate here ⟨src: d:user_accounts, d:roles⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| email | text | yes | Unique (case-insensitive, trimmed); login identifier ⟨src: d:identity_provider⟩ |
| password_hash | text | yes | Email + password sign-in ⟨src: d:identity_provider⟩ |
| role | enum | yes | One of: client, stylist, receptionist, salon_manager ⟨src: p:p1, p:p2, p:p3, p:p4, d:roles⟩ |
| display_name | text | yes | Shown in UI and audit fields ⟨src: default⟩ |
| invited_by | UUID → Account | no | Set for staff accounts created by an admin invite ⟨src: d:invite_flow⟩ |
| stylist_profile_id | UUID → Stylist Profile | no | Present when role = stylist ⟨src: p:p2, n:n3⟩ |
| client_record_id | UUID → Client Record | no | Present when role = client ⟨src: p:p1, n:n5⟩ |

**Uniqueness:** `email` is unique across all accounts ⟨src: d:identity_provider⟩.

### Salon Configuration

Single-row record holding salon-wide settings for the one location ⟨src: d:booking_locations⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| buffer_minutes | integer | yes | Fixed gap enforced after every appointment. Default 0 until the Salon Manager configures it ⟨src: d:booking_buffers⟩⟨src: default⟩ |
| cancellation_cutoff_minutes | integer | yes | Minutes before start within which a cancellation/reschedule is flagged or blocked. Default 1440 (24 hours) ⟨src: r10⟩⟨src: default⟩ |
| no_show_threshold | integer | yes | Number of no-shows at which a client is restricted. Default 3 ⟨src: d:booking_no_show⟩⟨src: default⟩ |
| brand_logo_url | text | no | Branding for emails/UI ⟨src: d:customization⟩ |
| brand_color | text | no | Branding accent color ⟨src: d:customization⟩ |

### Service (n2)

A treatment the salon offers ⟨src: n:n2⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| name | text | yes | e.g. "Cut & Blow-dry" ⟨src: n:n2⟩ |
| duration_minutes | integer | yes | Exact service length; drives the block reserved on the schedule ⟨src: n:n2, x8⟩ |
| price | decimal (currency) | yes | Stored positive; one price per service ⟨src: n:n2, d:booking_pricing_variation⟩ |
| category | text | no | Grouping label, e.g. "Colour" ⟨src: n:n2⟩ |

**Delete behaviour:** archiving a Service must not leave upcoming Appointments pointing at a missing service; affected upcoming Appointments are reassigned to another Service or cancelled at archive time ⟨src: r9⟩.

### Stylist Profile (n3)

A hairdresser's details and the services they offer ⟨src: n:n3⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| name | text | yes | e.g. "Maria" ⟨src: n:n3⟩ |
| bio | text | no | Free-text description ⟨src: n:n3⟩ |
| services_offered | UUID[] → Service | yes | Many-to-many; the set of Services this stylist may be booked for ⟨src: n:n3, r3⟩ |

**Relationships:** a Stylist Profile has many Working Hours rows and many Time Off blocks ⟨src: n:n4, n:n6⟩. `services_offered` is the many-to-many link enforcing that a stylist can only be booked for services they offer ⟨src: r3⟩.

**Delete behaviour:** archiving a Stylist Profile forces reassignment of that stylist's upcoming Appointments to another qualified stylist; Appointments are never left pointing at a missing stylist ⟨src: x1, r9⟩.

### Working Hours (n4)

Recurring weekly availability for a stylist ⟨src: n:n4, d:booking_availability_rules⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| stylist_profile_id | UUID → Stylist Profile | yes | Owner of this schedule row ⟨src: n:n4⟩ |
| day_of_week | enum | yes | One of: monday, tuesday, wednesday, thursday, friday, saturday, sunday ⟨src: n:n4⟩ |
| start_time | time | yes | Local start of availability ⟨src: n:n4⟩ |
| end_time | time | yes | Local end of availability; must be after start_time ⟨src: n:n4⟩ |

**Uniqueness:** at most one Working Hours row per (stylist_profile_id, day_of_week) ⟨src: default⟩.

### Time Off (n6)

A block during which a stylist is unavailable ⟨src: n:n6⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| stylist_profile_id | UUID → Stylist Profile | yes | Stylist who is unavailable ⟨src: n:n6⟩ |
| start_date | date | yes | First unavailable day ⟨src: n:n6⟩ |
| end_date | date | yes | Last unavailable day; must be ≥ start_date ⟨src: n:n6⟩ |
| reason | text | no | e.g. "holiday" ⟨src: n:n6⟩ |

### Client Record (n5)

Contact details and visit history for a client ⟨src: n:n5, d:booking_customer_records⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| name | text | yes | e.g. "Sarah Lee" ⟨src: n:n5⟩ |
| phone | text | yes | Contact number ⟨src: n:n5⟩ |
| email | text | yes | Unique (case-insensitive, trimmed); used to match on import ⟨src: n:n5, d:booking_intake_form⟩ |
| visit_count | integer (derived) | yes | Derived: count of this client's Appointments with status = attended ⟨src: n:n5, r13⟩ |
| no_show_count | integer (derived) | yes | Derived: count of this client's Appointments with status = no_show ⟨src: r13, d:booking_no_show⟩ |
| is_restricted | boolean (stored) | yes | Stored flag. Set true automatically when no_show_count ≥ Salon Configuration.no_show_threshold; the Salon Manager may clear it manually to re-enable self-booking ⟨src: d:booking_no_show, r13⟩ |

**Uniqueness:** `email` is unique across Client Records ⟨src: default⟩.

**Relationships:** a Client Record has many Appointments (past and future) ⟨src: n:n5, d:booking_customer_records⟩.

**Sensitive data:** name, phone, and email are personal data handled with consent/retention care ⟨src: d:compliance_sensitivity⟩.

### Appointment (n1)

A booked 1:1 time slot for one client with one stylist for one service ⟨src: n:n1, d:booking_slot_capacity⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| client_record_id | UUID → Client Record | yes | Exactly one client ⟨src: n:n1, r8⟩ |
| stylist_profile_id | UUID → Stylist Profile | yes | Exactly one stylist ⟨src: n:n1, r8⟩ |
| service_id | UUID → Service | yes | Exactly one service ⟨src: n:n1, r8⟩ |
| start_at | timestamp | yes | Local start of the appointment ⟨src: n:n1⟩ |
| end_at | timestamp (derived) | yes | Derived: start_at + Service.duration_minutes ⟨src: n:n1, n:n2, x8⟩ |
| buffer_minutes | integer | yes | Snapshot of Salon Configuration.buffer_minutes at booking time ⟨src: d:booking_buffers⟩ |
| price_charged | decimal (currency) | yes | Positive; snapshot of Service.price at booking time so history survives later price edits ⟨src: n:n2, d:booking_pricing_variation⟩ |
| status | enum | yes | One of: pending, confirmed, cancelled, attended, no_show. New bookings start pending ⟨src: n:n1, r12, r13⟩ |
| idempotency_key | text | no | Deduplicates double-click/retry submissions into one Appointment ⟨src: x3⟩ |

**Derived interval for overlap checks:** an Appointment occupies the half-open interval [start_at, end_at + buffer_minutes) for the purpose of double-booking detection ⟨src: d:booking_buffers, r1⟩.

**Uniqueness / integrity:** each Appointment has exactly one client, one stylist, and one service ⟨src: r8⟩. Two non-cancelled Appointments for the same stylist must never have overlapping occupied intervals, except where staff exercise an explicit double-book override recorded on the row ⟨src: r1, x6⟩.

### Cancellation (n7)

A record created when an Appointment is cancelled ⟨src: n:n7⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| appointment_id | UUID → Appointment | yes | One-to-one with the cancelled Appointment ⟨src: n:n7⟩ |
| cancelled_by | UUID → Account | yes | The actor who cancelled; required before the cancellation completes ⟨src: n:n7, r11⟩ |
| reason | text | yes | Required before the cancellation completes ⟨src: n:n7, r11⟩ |
| cancelled_at | timestamp | yes | When the cancellation was recorded ⟨src: n:n7⟩ |
| was_override | boolean | yes | True when staff cancelled inside the cut-off window under an override ⟨src: r10, x6⟩ |

The timing guard (must be before start, cut-off handling, and staff override) lives in the rules section, not as a hard field constraint, so a valid staff override can still be persisted ⟨src: r6, r10, x6⟩.

### Reminder (n8)

A message sent to a client before their appointment ⟨src: n:n8⟩.

| Field | Type | Required | Notes |
|---|---|---|---|
| appointment_id | UUID → Appointment | yes | The appointment being reminded about ⟨src: n:n8⟩ |
| send_time | timestamp | yes | Scheduled send time ⟨src: n:n8⟩ |
| channel | enum | yes | One of: email, sms ⟨src: n:n8, d:booking_reminders⟩ |
| status | enum | yes | One of: pending, sent, delivered, failed. New reminders start pending ⟨src: n:n8, x7⟩ |

A reminder may carry a confirmation link the client can use to confirm the appointment; a failed reminder does not cancel the booking — the Appointment stands and the reminder is retried or flagged ⟨src: d:booking_reminders, x7⟩.

### Import contract

The salon may load existing clients once from a spreadsheet during setup ⟨src: d:data_import⟩.

- **Accepted format:** a single `.csv` file, UTF-8 encoded ⟨src: d:data_import⟩⟨src: default⟩.
- **Target entity:** Client Record ⟨src: n:n5, d:data_import⟩.
- **Required headers:** `name` (text), `phone` (text), `email` (text, email format) ⟨src: n:n5⟩.
- **Record resolution:** a row resolves to an existing Client Record by `email`, compared case-insensitively after trimming leading/trailing whitespace ⟨src: n:n5⟩.
- **Resolved rows:** update the matched Client Record's name and phone from the row ⟨src: n:n5⟩.
- **Unresolved rows:** an email with no match creates a new Client Record ⟨src: n:n5⟩.
- **Invalid rows:** a row missing `name`, `phone`, or a syntactically valid `email` is rejected and listed in a downloadable error report; it is not imported ⟨src: n:n5⟩⟨src: default⟩.
- **File retention:** the uploaded file is discarded after the import completes; only the resulting Client Records are kept ⟨src: default⟩.

### Export

Lists (Appointments, Client Records, Services) can be downloaded as CSV; no external API is provided in v1 ⟨src: d:data_export, d:integrations⟩.

## Lifecycles (state machines)

### Appointment

Each Appointment starts in `pending` and moves through 5 states.

States:
- `pending` — Pending: A newly booked appointment held tentatively until confirmed (r12).
- `confirmed` — Confirmed: The appointment is confirmed and occupies the stylist's slot.
- `cancelled` — Cancelled: The appointment was cancelled; may be restored if the slot is still free.
- `attended` — Attended: The client showed up and the appointment took place.
- `no_show` — No-show: The client did not turn up; tracked against the Client Record.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `pending` | `confirmed` | system | Slot verified free and booking auto-confirmed | stylist working, slot free, not in time off, within salon hours | ⟨src: a1, a5, r1, r2, r4, r12, x4, booking_confirmation⟩ |
| `pending` | `cancelled` | Receptionist | Booking abandoned or cancelled before confirmation | — | ⟨src: a6, booking_cancellation_policy⟩ |
| `confirmed` | `confirmed` | Receptionist | Appointment rescheduled to a new time | new slot free and not within cut-off unless staff override | ⟨src: a3, r10, booking_reschedule, x6⟩ |
| `confirmed` | `cancelled` | Receptionist | Staff cancels the appointment with reason | before start time; within cut-off may be flagged unless staff override | ⟨src: a2, a6, r6, r10, r11, booking_cancellation_policy, x6⟩ |
| `confirmed` | `attended` | Stylist | Staff marks the client as attended | — | ⟨src: r13, a8⟩ |
| `confirmed` | `no_show` | Receptionist | Staff marks the client as a no-show | — | ⟨src: r13, booking_no_show⟩ |
| `cancelled` | `confirmed` | Receptionist | Cancelled appointment reinstated | original slot still open | ⟨src: x5⟩ |

Terminal: `attended`, `no_show` — once reached, no further transitions.

### Cancellation

Each Cancellation starts in `draft` and moves through 2 states.

States:
- `draft` — Draft: A cancellation being recorded; awaiting who cancelled and reason.
- `completed` — Completed: Cancellation finalised with canceller and reason recorded.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `draft` | `completed` | Receptionist | Who cancelled and reason are recorded | cancelled-by and reason present | ⟨src: a2, a6, r11, n7⟩ |

Terminal: `completed` — once reached, no further transitions.

### Client Record

Each Client Record starts in `active` and moves through 3 states.

States:
- `active` — Active: A client in good standing who can book freely.
- `restricted` — Restricted: Repeat no-show client restricted or required to prepay before booking.
- `archived` — Archived: Client record soft-deleted; can be restored.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `restricted` | system | Repeated no-shows counted against the client | no-show count exceeds threshold | ⟨src: r13, booking_no_show⟩ |
| `restricted` | `active` | Salon Manager | Staff lifts the restriction | — | ⟨src: booking_no_show⟩ |
| `active` | `archived` | Salon Manager | Client record deleted | — | ⟨src: deletion⟩ |
| `restricted` | `archived` | Salon Manager | Client record deleted | — | ⟨src: deletion⟩ |
| `archived` | `active` | Salon Manager | Client record restored | — | ⟨src: deletion⟩ |

Terminal: none declared.

### Reminder

Each Reminder starts in `scheduled` and moves through 5 states.

States:
- `scheduled` — Scheduled: A reminder queued to be sent before the appointment.
- `sent` — Sent: The reminder message has been dispatched to the client.
- `delivered` — Delivered: The reminder was successfully delivered.
- `failed` — Failed: Delivery failed; booking stands and reminder is retried/flagged.
- `cancelled` — Cancelled: The reminder was cancelled because the appointment was cancelled.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `scheduled` | `sent` | system | Send time reached and message dispatched | — | ⟨src: a12, n8, booking_reminders⟩ |
| `scheduled` | `cancelled` | system | Underlying appointment cancelled before send | — | ⟨src: a2, a6⟩ |
| `sent` | `delivered` | system | Delivery confirmed by channel | — | ⟨src: n8, booking_reminders⟩ |
| `sent` | `failed` | system | Delivery reported as failed | — | ⟨src: x7⟩ |
| `failed` | `sent` | system | Reminder retried | — | ⟨src: x7⟩ |

Terminal: `delivered`, `cancelled` — once reached, no further transitions.

### Service

Each Service starts in `active` and moves through 2 states.

States:
- `active` — Active: A bookable service on the menu with duration and price.
- `archived` — Archived: Service soft-deleted; can be restored, existing appointments handled first.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `archived` | Salon Manager | Manager removes the service | upcoming appointments reassigned or cancelled first | ⟨src: a9, r7, r9, deletion⟩ |
| `archived` | `active` | Salon Manager | Manager restores the service | — | ⟨src: deletion⟩ |

Terminal: none declared.

### Stylist Profile

Each Stylist Profile starts in `active` and moves through 2 states.

States:
- `active` — Active: An active stylist offering services and taking bookings.
- `archived` — Archived: Stylist profile soft-deleted; future appointments reassigned.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `archived` | Salon Manager | Manager removes the stylist profile | future appointments reassigned to another stylist | ⟨src: a10, r7, r9, x1, deletion⟩ |
| `archived` | `active` | Salon Manager | Manager restores the stylist profile | — | ⟨src: deletion⟩ |

Terminal: none declared.

### Time Off

Each Time Off starts in `scheduled` and moves through 4 states.

States:
- `scheduled` — Scheduled: A future block where the stylist will be unavailable.
- `active` — Active: The time off period is currently in effect.
- `ended` — Ended: The time off period has passed.
- `cancelled` — Cancelled: The time off block was cancelled before it started.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `scheduled` | `active` | system | Start date reached | — | ⟨src: a7, n6⟩ |
| `scheduled` | `cancelled` | Stylist | Stylist cancels the time off | before start date | ⟨src: a7, booking_staff_schedule_control⟩ |
| `active` | `ended` | system | End date passed | — | ⟨src: a7, n6⟩ |

Terminal: `ended`, `cancelled` — once reached, no further transitions.

> ⚠️ Mechanical lifecycle check: 3 finding(s) remain — see compile-report.json.

## Rules & invariants

Every Sheet rule is restated below with a stable id (`R-<n>`), a verification sketch, and the entities/actions it constrains. Derived invariants that follow from the decision log carry ids continuing the same sequence. Unless a rule is listed in the override scope (R-19), it is absolute for all roles.

### Booking integrity

**R-1 — Stylist must be working and free.** An Appointment may be committed for a time slot only when the chosen Stylist is within their Working Hours and has no other non-cancelled Appointment overlapping that slot. ⟨src: r1⟩ *Verify:* Given Maria already has a 2:00pm Appointment, When a second booking targets Maria at 2:00pm, Then the booking is rejected (unless committed under a staff override per R-19). Constrains: Appointment, a1, a5. ⟨src: r1, a:a1, a:a5⟩ Staff may override R-1 per R-19. ⟨src: d:x6, r1⟩

**R-2 — No booking during Time Off.** An Appointment must never fall within any Time Off block of the assigned Stylist. ⟨src: r2⟩ *Verify:* Given Maria has Time Off Mar 20–24, When any slot Mar 20–24 is booked for Maria, Then it is rejected (unless committed under a staff override per R-19). Constrains: Appointment, Time Off, a1, a5. ⟨src: r2, n:n6⟩ Staff may override R-2 per R-19. ⟨src: d:x6, r2⟩

**R-3 — Stylist booked only for offered Services.** An Appointment's Service must be present in the assigned Stylist Profile's set of offered Services. ⟨src: r3⟩ *Verify:* Given Maria does not offer Balayage, When a Balayage Appointment is booked with Maria, Then it is rejected. R-3 is never overridable by any role. Constrains: Appointment, Stylist Profile, Service, a1, a5. ⟨src: r3, n:n3, n:n2⟩

**R-4 — No past or out-of-hours booking.** An Appointment must never start in the past nor outside the salon's opening Working Hours. ⟨src: r4⟩ *Verify:* Given salon hours Tue–Sat 9–6, When a booking is made for yesterday or for 11:00pm, Then it is rejected (unless committed under a staff override per R-19). Constrains: Appointment, Working Hours, a1, a5. ⟨src: r4, n:n4⟩ Staff may override R-4 per R-19. ⟨src: d:x6, r4⟩

**R-8 — Exactly one client, stylist, and service.** Every Appointment must reference exactly one Client, exactly one Stylist, and exactly one Service; none may be null. ⟨src: r8⟩ *Verify:* When an Appointment is saved with a missing stylist, client, or service, Then the write is rejected. Constrains: Appointment. ⟨src: r8, n:n1⟩

**R-9 — Removing a Service or Stylist must not orphan Appointments.** Archiving a Service or Stylist Profile must, at archive time, either reassign or cancel every upcoming Appointment referencing it, never leave an Appointment pointing at a missing Service or Stylist. ⟨src: r9⟩ For a removed Stylist Profile the default action is forced reassignment to another Stylist who offers the same Service; where none exists the Appointment is cancelled with a recorded Cancellation. ⟨src: d:x1, r9⟩ *Verify:* After archiving Maria's profile, no upcoming Appointment references Maria; each is either reassigned or cancelled. Constrains: Service, Stylist Profile, Appointment, a9, a10. ⟨src: r9, n:n2, n:n3, a:a9, a:a10⟩

**R-11 — Cancellation must record actor and reason.** A Cancellation must not be completed until `cancelled_by` and `reason` are both set. ⟨src: r11⟩ *Verify:* When a cancel is submitted with a blank reason, Then it is rejected and the Appointment stays active. Constrains: Cancellation, a2, a6. ⟨src: r11, n:n7, a:a2, a:a6⟩

### State and lifecycle rules

**R-6 — Cancellations only before start.** A Cancellation's `cancelled_at` must be strictly before the Appointment's start time. ⟨src: r6⟩ R-6 is never overridable by any role; there is no after-start cancellation path, and non-attendance after start is handled through the attended/no-show marking (R-13), not a Cancellation. ⟨src: r6, r13⟩ *Verify:* Given an Appointment starting at 14:00, When a cancel is attempted at 14:30, Then it is rejected for every role. Constrains: Cancellation, Appointment, a2, a6. ⟨src: r6, a:a2, a:a6⟩

**R-10 — Cut-off on late cancel and reschedule.** A cancel or reschedule requested within `SalonConfiguration.cancellation_cutoff_minutes` of the Appointment start is blocked for Clients and flagged for staff; default cut-off is 1440 minutes (24 hours). ⟨src: r10, default⟩ *Verify:* Given a 24h cut-off and an Appointment at 14:00 today, When a Client requests cancel at 09:00 today, Then it is blocked. Constrains: Appointment, Cancellation, a2, a3. ⟨src: r10, a:a2, a:a3⟩ Staff may override R-10 per R-19. ⟨src: d:x6, r10⟩

**R-12 — New Appointments are pending until confirmed.** A newly booked Appointment enters status `pending` and is not treated as final until it reaches `confirmed`; when the target slot is free at booking it is confirmed instantly, otherwise it stays pending until confirmed. ⟨src: r12, d:booking_confirmation⟩ A Client may confirm their own pending Appointment only from its Reminder message; staff may confirm any Appointment. ⟨src: r12, d:booking_reminders⟩ *Verify:* After booking into a free slot, status = confirmed; a pending Appointment moves to confirmed only via reminder-confirm (Client) or staff confirm. Constrains: Appointment, a1, a5, a12. ⟨src: r12, d:booking_confirmation, a:a1, a:a5⟩

**R-13 — Attended and no-show marking.** Staff must be able to mark a started Appointment as `attended` or `no_show`, and each `no_show` increments the linked Client Record's no-show count. ⟨src: r13⟩ *Verify:* When a Stylist marks their 14:00 Appointment as no-show, Then the Client Record's `no_show_count` increases by one. Constrains: Appointment, Client Record. ⟨src: r13, n:n5⟩

### Access rules

**R-5 — Clients act only on their own Appointments.** A Client may view, cancel, or reschedule only Appointments where they are the client, and may never see or change another Client's Appointments. ⟨src: r5⟩ *Verify:* Given Sarah is signed in, When she requests Tom's Appointment, Then access is denied (403). Constrains: Appointment, Client Record, a2, a3, a4, a8. ⟨src: r5, a:a2, a:a3, a:a4⟩

**R-7 — Only staff edit catalog and schedules.** Only Stylist, Receptionist, or Salon Manager accounts may create or edit Services, Stylist Profiles, or Working Hours per the permission matrix; Clients may never. ⟨src: r7⟩ *Verify:* When a Client attempts to change a Service price, Then it is denied. Constrains: Service, Stylist Profile, Working Hours, a9, a10, a11. ⟨src: r7, a:a9, a:a10, a:a11⟩

### Derived invariants

**R-14 — No overlapping Appointments per Stylist.** No two non-cancelled Appointments for the same Stylist may overlap, where each Appointment occupies its Service duration plus `SalonConfiguration.buffer_minutes`. ⟨src: d:booking_slot_capacity, d:booking_buffers⟩ R-14 is the persisted restatement of R-1's not-already-booked clause and is overridable by staff in step with R-1 per R-19. ⟨src: r1, d:x6⟩ *Verify:* Attempt to insert two overlapping non-cancelled Appointments for Maria without override → rejected. Constrains: Appointment. ⟨src: d:booking_slot_capacity, n:n1⟩

**R-15 — Availability is a strict intersection.** A slot is offered as bookable only if it fits fully within salon Working Hours AND within the Stylist's Working Hours AND outside every Time Off block; failing any one, the slot is shown as unavailable. ⟨src: d:x4, n:n4, n:n6⟩ R-15 governs the availability presented to Clients and to non-override booking; the same staff override that applies to R-1, R-2, and R-4 (R-19) lets staff commit outside this intersection at booking time. ⟨src: d:x4, r1, r2, r4⟩ *Verify:* Given a slot straddling the end of Maria's Working Hours, When a Client browses availability, Then that slot is not offered. Constrains: Appointment, Working Hours, Time Off. ⟨src: d:x4, n:n4⟩

**R-16 — Slot lock during checkout.** While one Client is completing a booking, the target slot is held/locked so a second Client cannot commit the same Stylist slot concurrently. ⟨src: d:x2⟩ *Verify:* Two concurrent bookings for Maria at 2:00pm → only the holder of the lock may commit; the other sees the slot unavailable. Constrains: Appointment, a1. ⟨src: d:x2, a:a1⟩

**R-17 — Duplicate submissions collapse to one.** Repeated booking submissions of the same Client, Stylist, Service, and start time (double-click or retry) must be detected and collapsed into a single Appointment. ⟨src: d:x3⟩ *Verify:* Submit an identical booking twice within the retry window → exactly one Appointment exists. Constrains: Appointment, a1, a5. ⟨src: d:x3, a:a1⟩

**R-18 — Restore only into an open slot.** A cancelled Appointment may be reinstated only when its original slot is still open under R-14; if the slot has since been taken, the restore fails and the Appointment stays cancelled. ⟨src: d:x5⟩ *Verify:* Restore a cancelled Appointment whose slot was rebooked → rejected. Constrains: Appointment. ⟨src: d:x5, n:n1⟩

**R-19 — Staff override scope.** Receptionist and Salon Manager accounts may override R-1, R-2, R-4, R-10, and their derived restatements R-14 and R-15 at book, cancel, or reschedule time, each override recorded with a warning; R-3, R-5, R-6, and R-7 are never overridable by any role. ⟨src: d:x6, r1, r2, r4, r10, r6⟩ *Verify:* A Receptionist books Maria during her Time Off → succeeds with a recorded warning; the same Receptionist attempting to cancel after start (R-6) → rejected. Constrains: Appointment, a5, a6. ⟨src: d:x6, a:a5, a:a6⟩

**R-20 — Buffer default.** `SalonConfiguration.buffer_minutes` is the fixed gap enforced after every Appointment and defaults to 0 minutes until the Salon Manager configures it; the same value is used by R-14 and R-15. ⟨src: d:booking_buffers, default⟩ *Verify:* With buffer 0, back-to-back Appointments are allowed; after setting buffer 10, the next slot for that Stylist starts 10 minutes after the prior Appointment ends. Constrains: Salon Configuration, Appointment. ⟨src: d:booking_buffers⟩

**R-21 — Exact-duration blocking.** An Appointment blocks exactly its Service `duration_minutes` (plus buffer per R-20); the next bookable slot starts after that block, with no rounding to a fixed grid. ⟨src: d:x8, n:n2⟩ *Verify:* A 45-minute Service booked at 2:00pm frees the Stylist at 2:45pm plus buffer. Constrains: Appointment, Service. ⟨src: d:x8, n:n2⟩

**R-22 — No-show restriction is a manager-liftable flag.** `ClientRecord.is_restricted` is a stored flag set true when `no_show_count` reaches `SalonConfiguration.no_show_threshold` (default 3); the Salon Manager may lift the restriction by setting the flag false without altering `no_show_count`. ⟨src: d:booking_no_show, r13, default⟩ *Verify:* After a Client's third no-show, `is_restricted` = true; when the Salon Manager lifts it, `is_restricted` = false and `no_show_count` is unchanged. Constrains: Client Record, a12. ⟨src: d:booking_no_show, n:n5⟩

**R-23 — Reminder failure does not void the booking.** If a Reminder fails to send, the Appointment stands; the Reminder is retried and flagged as `failed`, and no Appointment status changes as a result. ⟨src: d:x7, n:n8⟩ *Verify:* Force a Reminder send to fail → Appointment remains confirmed and the Reminder shows status `failed`. Constrains: Reminder, Appointment, a12. ⟨src: d:x7, n:n8⟩

**R-24 — Unique account email.** Every Account `email` must be unique, compared case-insensitively and trimmed of surrounding whitespace. ⟨src: d:identity_provider⟩ *Verify:* Inviting a second Account with an existing email (any casing) → rejected. Constrains: Account. ⟨src: d:identity_provider⟩

**R-25 — Soft delete only.** Deleting any record sets `archived_at` and hides it from normal lists; no record is physically removed in v1, and only the Salon Manager may archive or restore Services and Stylist Profiles. ⟨src: d:deletion, r7⟩ *Verify:* Archiving a Service leaves it retrievable for restore; no hard-delete path exists. Constrains: all entities, a9, a10. ⟨src: d:deletion⟩

## Acceptance scenarios

These scenarios are written Given/When/Then and are directly executable as acceptance tests. Every action (a1–a12) and every rule (r1–r13) is exercised at least once, and access rules carry an explicit negative case. Unless a scenario invokes the staff override of R-19, the app enforces the constraint for all roles. ⟨src: d:booking_time_zones⟩

### Booking a slot (a1, a5)

**AS-1 — Client books an open slot (happy path).** Given a signed-in Client, a Service that Maria offers, and a slot that fits fully within salon Working Hours and Maria's Working Hours and outside every Time Off block, When the Client submits the booking, Then an Appointment is created in `pending` and instantly transitions to `confirmed`, and the Client sees a confirmation and receives an email and SMS. ⟨src: a:a1, r:r1, r:r3, d:x4, d:booking_confirmation, r:r12, d:booking_reminders⟩

**AS-2 — Booking rejected for an unoffered Service.** Given Maria's Stylist Profile does not list Balayage, When any actor books Balayage with Maria, Then the booking is rejected; R-3 is never overridable by any role. ⟨src: r:r3, a:a1, a:a5, n:n3⟩

**AS-3 — Booking rejected in the past or outside opening hours.** Given salon hours Tue–Sat 9:00am–6:00pm, When a Client books for yesterday or for 11:00pm today, Then the booking is rejected. ⟨src: r:r4, a:a1, n:n4⟩

**AS-4 — Booking rejected during Time Off.** Given Maria has Time Off Mar 20–24, When a Client books Maria for Mar 21, Then the booking is rejected. ⟨src: r:r2, a:a1, n:n6⟩

**AS-5 — Booking rejected when the stylist is already booked.** Given Maria has a confirmed Appointment at 2:00pm, When a second Client books Maria at 2:00pm, Then the booking is rejected as the slot is not free. ⟨src: r:r1, a:a1⟩

**AS-6 — Slot sized to exact Service duration plus buffer.** Given a Service of 45 minutes and a configured buffer of 0 minutes, When slots are offered, Then each candidate slot reserves exactly 45 minutes and the next slot starts after the reserved block plus the buffer. ⟨src: d:x8, n:n2, d:booking_buffers⟩

**AS-7 — Receptionist books a walk-in.** Given a Receptionist at the front desk and an open slot, When the Receptionist books Tom with Maria for a Service she offers, Then the Appointment is created and confirmed, and if Tom matches an existing Client Record it is linked to it. ⟨src: a:a5, d:booking_walk_ins, n:n5⟩

**AS-8 — Every Appointment has exactly one client, stylist, and service.** When an Appointment is saved with a missing client, stylist, or service, Then the write is rejected. ⟨src: r:r8, n:n1⟩

### Cancelling and rescheduling (a2, a3, a6)

**AS-9 — Client cancels own Appointment before the cut-off.** Given a Client's Appointment starting in 48 hours and a cancellation cut-off of 1440 minutes, When the Client cancels and enters a reason, Then a Cancellation is completed recording the Client as canceller, the reason, and the time cancelled, and the Appointment moves to `cancelled`. ⟨src: a:a2, r:r5, r:r6, r:r11, r:r10, n:n7⟩

**AS-10 — Client cancel blocked inside the cut-off.** Given an Appointment starting in 2 hours and a 1440-minute cut-off, When the Client tries to cancel, Then the change is blocked and the Client is told to contact the salon. ⟨src: r:r10, a:a2, d:booking_cancellation_policy⟩

**AS-11 — Cancel blocked after the appointment start (never overridable).** Given an Appointment that started at 2:00pm, When any actor including a Receptionist or Salon Manager attempts to cancel at 2:30pm, Then it is rejected; non-attendance after start is handled only through the attended/no-show marking. ⟨src: r:r6, r:r13, a:a2, a:a6⟩

**AS-12 — Cancellation blocked without a reason.** When a cancel is submitted with a blank reason, Then the Cancellation stays in `draft` and the Appointment remains active. ⟨src: r:r11, n:n7⟩

**AS-13 — Client reschedules own Appointment before the cut-off.** Given a Client's Appointment and an open target slot that passes availability, When the Client reschedules before the cut-off, Then the Appointment moves to the new time and its Reminder is rescheduled. ⟨src: a:a3, r:r5, r:r10, n:n8⟩

**AS-14 — Receptionist cancels a no-show booking.** Given a confirmed Appointment before its start, When the Receptionist cancels it with a reason, Then a Cancellation is completed and the Appointment moves to `cancelled`. ⟨src: a:a6, r:r11, n:n7⟩

### Client Record (a4)

**AS-15 — Client updates own Client Record.** Given a signed-in Client, When they change their phone number, Then their own Client Record is updated. ⟨src: a:a4, r:r5, n:n5⟩

**AS-16 — Client cannot view or change another Client's data (negative access).** Given Client Sarah, When Sarah requests Tom's Appointment or Client Record, Then access is denied. ⟨src: r:r5, p:p1⟩

### Staff scheduling (a7, a8, a11)

**AS-17 — Stylist sets own Time Off.** Given Stylist Maria, When she blocks Mar 20–24 for holiday, Then a Time Off record is created and those dates become unbookable for her. ⟨src: a:a7, n:n6, d:booking_staff_schedule_control, r:r2⟩

**AS-18 — Stylist cannot set another stylist's schedule (negative access).** Given Stylist Maria, When she tries to set Jenny's Time Off or Working Hours, Then access is denied; only the Salon Manager may set any stylist's schedule. ⟨src: r:r7, a:a7, a:a11, d:booking_staff_schedule_control⟩

**AS-19 — Stylist views only own Appointments.** Given Stylist Maria, When she opens the day's bookings, Then she sees only Appointments assigned to her and no others. ⟨src: a:a8, r:r5⟩

**AS-20 — Salon Manager sets salon Working Hours.** Given the Salon Manager, When she sets salon hours Tue–Sat 9:00am–6:00pm, Then availability is computed within those hours. ⟨src: a:a11, n:n4, d:x4⟩

### Service catalog and profiles (a9, a10)

**AS-21 — Salon Manager adds a Service.** Given the Salon Manager, When she adds Balayage at 2 hours and $150, Then the Service appears in the menu with its stored positive price. ⟨src: a:a9, n:n2, d:booking_pricing_variation⟩

**AS-22 — Salon Manager edits which Services a Stylist offers.** Given the Salon Manager, When she updates Maria's offered Services, Then only those Services can be booked with Maria. ⟨src: a:a10, n:n3, r:r3⟩

**AS-23 — Client cannot edit Services, profiles, or hours (negative access).** Given a Client, When they attempt to change a Service price, a Stylist Profile, or Working Hours, Then access is denied. ⟨src: r:r7, p:p1⟩

**AS-24 — Archiving a Stylist reassigns or cancels upcoming Appointments.** Given Maria has upcoming Appointments, When the Salon Manager archives her Stylist Profile, Then every upcoming Appointment is reassigned to another Stylist who offers the same Service, or cancelled with a recorded Cancellation where none exists; no Appointment is left pointing at a missing Stylist. ⟨src: r:r9, d:x1, n:n3, a:a10⟩

**AS-25 — Archiving a Service reassigns or cancels upcoming Appointments.** Given upcoming Appointments reference a Service, When the Salon Manager archives that Service, Then each such Appointment is reassigned to another Service or cancelled, never orphaned. ⟨src: r:r9, n:n2, a:a9⟩

### Reminders, confirmation, attendance (a12, r12, r13)

**AS-26 — Salon Manager/system sends a Reminder.** Given a confirmed Appointment, When the send time is reached, Then a Reminder is dispatched to the Client by email and SMS and its status moves to `sent`. ⟨src: a:a12, n:n8, d:booking_reminders⟩

**AS-27 — Client confirms from the Reminder.** Given a Client's `pending` Appointment and its Reminder, When the Client confirms from the Reminder message, Then that Appointment moves to `confirmed`; a Client may confirm only their own Appointment and only from the Reminder. ⟨src: r:r12, d:booking_reminders, p:p1⟩

**AS-28 — Reminder delivery failure leaves the booking intact.** Given a confirmed Appointment whose Reminder cannot be delivered, When delivery fails, Then the Appointment stands and the Reminder is retried and flagged rather than the booking being changed. ⟨src: d:x7, n:n8⟩

**AS-29 — Staff mark attended or no-show.** Given a confirmed Appointment after its start, When the assigned Stylist marks it attended or a staff member marks it a no-show, Then it reaches the terminal `attended` or `no_show` state and the no-show is counted against the Client Record. ⟨src: r:r13, a:a8, d:booking_no_show⟩

**AS-30 — Repeat no-shows restrict a Client.** Given a Client whose no-show count reaches the threshold of 3, When the threshold is crossed, Then the Client Record moves to `restricted`, and the Salon Manager may later lift the restriction back to `active`. ⟨src: d:booking_no_show, r:r13, p:p3⟩

### Overrides and concurrency (x2, x3, x5, x6)

**AS-31 — Staff override with a warning.** Given a Receptionist booking a slot that violates R-1, R-2, R-4, or R-10, When the Receptionist confirms the on-screen warning, Then the Appointment is committed and the override is recorded; R-3 and R-6 can never be overridden. ⟨src: d:x6, r:r1, r:r2, r:r4, r:r10, r:r3, r:r6⟩

**AS-32 — Concurrent booking of the same slot.** Given two Clients selecting Maria's 2:00pm slot at the same moment, When the first completes booking, Then the slot lock prevents the second from committing and the second sees "That time is no longer available" and returns to the slot picker. ⟨src: d:x2⟩

**AS-33 — Duplicate submission collapses to one Appointment.** Given a Client double-clicks or retries a booking submission, When the duplicate requests arrive, Then exactly one Appointment is created. ⟨src: d:x3⟩

**AS-34 — Restore a cancelled Appointment only if the slot is free.** Given a cancelled Appointment whose original slot is still open, When a Receptionist or Salon Manager restores it, Then it returns to `confirmed`; if the slot has since been taken, Then restore fails and the Appointment stays cancelled. ⟨src: d:x5, p:p4, p:p3⟩

### Data operations (export, import, dashboard, invite)

**AS-35 — Salon Manager exports data as CSV.** Given the Salon Manager, When she exports a list, Then a CSV download is produced; a Receptionist or Stylist attempting the same export is denied. ⟨src: d:data_export, p:p3, p:p4, p:p2⟩

**AS-36 — Salon Manager imports a spreadsheet once.** Given the Salon Manager and a spreadsheet of existing records, When she runs the one-time import, Then rows that resolve are created and unresolved rows are reported per the import contract; no other role may import. ⟨src: d:data_import, p:p3⟩

**AS-37 — Salon Manager views the dashboard.** Given the Salon Manager, When she opens the dashboard, Then she sees today's total bookings, no-shows, and busiest stylists as simple counts; no other role sees the dashboard. ⟨src: d:reporting, p:p3⟩

**AS-38 — Admin invites a staff member.** Given the Salon Manager, When she invites a new Stylist or Receptionist by email, Then an account is created via invitation; open self-signup is not available. ⟨src: d:invite_flow, p:p3⟩

## Key journeys

These journeys trace the primary end-to-end flows through Salon Book. Each step names the actor, what they see, and any email or SMS that is sent. All times are in the single salon-local time zone. ⟨src: d:booking_time_zones⟩

### Journey 1 — Client books a service online

Actor: Client, on a phone browser. ⟨src: p1, d:platform⟩

1. The Client signs in with email and password and lands on the Service menu, which lists each Service with its name, duration, and price. ⟨src: d:identity_provider, n2, d:booking_service_catalog⟩
2. The Client picks a Service, then chooses a Stylist; only Stylists whose profile offers that Service are shown. ⟨src: a1, r3, n3⟩
3. The app shows open time slots computed as the strict intersection of salon Working Hours, that Stylist's Working Hours, and time outside every Time Off block, each slot sized to the exact Service duration plus the configured buffer. ⟨src: d:x4, n4, n6, d:x8, d:booking_buffers⟩
4. Past times and times outside salon opening hours are not offered. ⟨src: r4⟩
5. The Client selects a slot; the slot is held under a short lock while the Client completes the booking, so a second Client cannot take the same slot at the same moment. ⟨src: d:x2⟩
6. The Client confirms. The Appointment is created and instantly confirmed because the slot is free; a duplicate submission from a double-click or retry collapses into the one Appointment. ⟨src: d:booking_confirmation, r1, d:x3⟩
7. The Client sees a confirmation screen showing the stylist, service, date, and time, and receives a confirmation by both email and SMS. ⟨src: n1, d:booking_reminders⟩
8. **Slot-taken case:** if the held slot was committed by another Client first, the Client sees "That time is no longer available" and is returned to the slot picker to choose another. ⟨src: d:x2⟩

### Journey 2 — Reminder, then the Client confirms, reschedules, or cancels

Actor: Client, with a scheduled Reminder. ⟨src: p1, n8⟩

1. Ahead of the Appointment, the salon sends the Client a Reminder by both email and SMS carrying the stylist, service, date, and time. ⟨src: a12, n8, d:booking_reminders⟩
2. From the Reminder the Client can confirm their own Appointment; a Client may confirm only an Appointment where they are the client, and only from this message. ⟨src: r12, d:booking_reminders⟩
3. Before the cancellation cut-off (default 24 hours before start), the Client can reschedule their own Appointment to another open slot, or cancel it. ⟨src: a2, a3, r5, r6, r10⟩
4. To cancel, the Client must enter a reason; the system writes a Cancellation recording that the Client cancelled it, the reason, and the time cancelled before the cancellation completes. ⟨src: r11, n7⟩
5. **Inside the cut-off:** if the Client tries to cancel or reschedule within the cut-off window or after the start time, the change is blocked and the message tells them to contact the salon. ⟨src: r10, r6, d:booking_cancellation_policy⟩
6. **Reminder-failed case:** if the Reminder cannot be delivered, the Appointment still stands and the Reminder is retried and flagged rather than the booking being changed. ⟨src: d:x7, n8⟩

### Journey 3 — Receptionist books a walk-in and records the outcome

Actor: Receptionist at the front desk. ⟨src: p4, d:booking_walk_ins⟩

1. The Receptionist signs in and opens the booking screen for a walk-in client with a chosen Stylist and Service. ⟨src: a5, d:booking_walk_ins⟩
2. The system offers the same intersection of salon hours, stylist hours, and time off as the Client flow. ⟨src: d:x4⟩
3. **Override case:** if the wanted slot is already booked (r1), falls inside the Stylist's Time Off (r2), sits in the past or outside opening hours (r4), or is inside the cancellation cut-off for a change (r10), the Receptionist may override with an on-screen warning, and the override is recorded; cancelling after the appointment start time (r6) can never be overridden. ⟨src: d:x6, r1, r2, r4, r10, r6⟩
4. The Appointment is created; if the walk-in maps to an existing Client Record, a confirmation is sent by email and SMS. ⟨src: n1, n5, d:booking_reminders⟩
5. At appointment time, the Receptionist marks the Appointment as attended or as a no-show. ⟨src: r13, a6⟩
6. A no-show increments the no-show count on that Client Record; when the count reaches the salon-configured threshold (default 3) the Client is flagged as restricted for the Salon Manager to act on. ⟨src: r13, d:booking_no_show⟩
7. **Restore case:** if an Appointment was cancelled in error, the Receptionist can restore it only while the original slot is still open; if the slot has been taken, restore fails and it stays cancelled. ⟨src: d:x5⟩

### Journey 4 — Stylist manages their schedule

Actor: Stylist. ⟨src: p2⟩

1. The Stylist signs in and views the day's Appointments assigned to them, seeing client name, service, and time for each. ⟨src: a8, n1⟩
2. A Stylist views only Appointments where they are the assigned stylist. ⟨src: r5, a8⟩
3. The Stylist sets Time Off for a date range with a reason, blocking new bookings in that window; a Stylist may set Time Off only for themselves. ⟨src: a7, n6, r2, d:booking_staff_schedule_control⟩
4. Existing Appointments that already fall inside a newly entered Time Off range are flagged to the Salon Manager and Receptionist to reassign or cancel rather than left standing (default). ⟨src: default, r2⟩
5. The Stylist marks each of their Appointments attended or no-show after the visit. ⟨src: r13, a8⟩

### Journey 5 — Salon Manager configures the catalog and offboards a stylist

Actor: Salon Manager. ⟨src: p3⟩

1. The Manager signs in and adds a Service with name, duration, price, and category. ⟨src: a9, n2⟩
2. The Manager edits a Stylist Profile to set which Services that Stylist offers, which then governs who can be booked for each Service. ⟨src: a10, n3, r3⟩
3. The Manager sets the salon Working Hours per day of week. ⟨src: a11, n4⟩
4. When a Stylist leaves, the Manager archives that Stylist Profile; the system forces every upcoming Appointment on that Stylist to be reassigned to another Stylist who offers the Service rather than left pointing at a missing stylist. ⟨src: d:x1, r9, n1⟩
5. Reassigned Clients are notified of the change by email and SMS. ⟨src: d:booking_reminders⟩
6. The Manager opens the dashboard and sees today's totals at a glance: total bookings, no-shows, and busiest stylists, as simple counts. ⟨src: d:reporting⟩
7. The Manager can export lists as CSV and, in one-time setup, import existing clients or services from a spreadsheet. ⟨src: d:data_export, d:data_import⟩

## Non-goals

This version deliberately excludes the capabilities below. For each, the entry names what a reader might wrongly assume and the nearest behaviour that *is* in scope, so the boundary is unambiguous.

### No online payments or deposits

Salon Book does not take payments or deposits online at the time of booking. ⟨src: g:g1, d:booking_prepayment⟩ A reader might assume a card is charged or a deposit is held to secure the slot; it is not. The nearest in-scope behaviour is that each Service's price is displayed at booking and payment is settled in person, while the slot is held only by a short checkout lock. ⟨src: n:n2, d:x2⟩

### No retail products or gift cards

The app does not sell retail products or gift cards. ⟨src: g:g2⟩ A reader might assume clients can buy shampoo or vouchers through the same portal. The nearest in-scope behaviour is the Service menu, which lists bookable treatments with their duration and price only. ⟨src: n:n2, d:booking_service_catalog⟩

### No payroll or commissions

The app does not manage stylist payroll or commissions. ⟨src: g:g3⟩ A reader might assume it tracks each stylist's earnings or pay. The nearest in-scope behaviour is the Salon Manager dashboard showing busiest-stylist counts as simple totals, with no monetary calculation. ⟨src: d:reporting⟩

### No loyalty or points program

The app does not run a loyalty or points program. ⟨src: g:g4⟩ A reader might assume clients accrue points or rewards across visits. The nearest in-scope behaviour is the Client Record, which keeps past and future visit history without any reward accounting. ⟨src: n:n5, d:booking_customer_records⟩

### No group or party bookings

The app does not handle group or multi-person party bookings in one slot. ⟨src: g:g5, d:booking_slot_capacity⟩ A reader might assume several clients can be booked into a single slot together. The nearest in-scope behaviour is separate 1:1 Appointments, each reserving one Stylist's time for one Client. ⟨src: n:n1, d:booking_resource_model⟩

### No recurring or repeating bookings

The app does not create repeating booking series (every Tuesday, monthly). ⟨src: d:booking_recurring⟩ A reader might assume a standing weekly appointment can be set up once and auto-repeat. The nearest in-scope behaviour is that each Appointment is booked separately for its own date and time. ⟨src: a:a1, n:n1⟩

### No external calendar sync

The app does not talk to Google, Outlook, or Apple calendars in either direction. ⟨src: d:booking_calendar_sync⟩ A reader might assume Appointments appear in a stylist's personal calendar or that external busy time blocks availability here. The nearest in-scope behaviour is that Salon Book is the calendar of record; a Stylist views their own Appointments inside the app. ⟨src: a:a8, d:booking_availability_rules⟩

### No multi-location support

The app does not manage more than one salon or branch. ⟨src: d:booking_locations⟩ A reader might assume they can add a second location with its own staff and hours. The nearest in-scope behaviour is one location, with each Stylist carrying their own Working Hours and Time Off. ⟨src: n:n4, n:n6, d:booking_availability_rules⟩

### No external integrations or public API

The app does not connect to accounting, payment, or any third-party tools, and exposes no public API or webhooks. ⟨src: d:integrations⟩ A reader might assume data flows out to another system automatically. The nearest in-scope behaviour is one-time spreadsheet import and manual CSV export by the Salon Manager. ⟨src: d:data_import, d:data_export⟩

### No automatic waitlist offers

The app does not automatically offer a freed slot to the next person in line. ⟨src: d:booking_waitlist⟩ A reader might assume a cancellation triggers an instant automated offer. The nearest in-scope behaviour is a manual waitlist that a Client joins, from which staff contact them if a slot opens. ⟨src: d:booking_waitlist⟩

### No viewable change history

The app does not provide a full, viewable audit trail of every change. ⟨src: d:audit_trail⟩ A reader might assume they can browse the complete edit history of an Appointment or Client Record. The nearest in-scope behaviour is a basic stamp of who created or updated each record and when. ⟨src: d:audit_trail⟩

### No custom reports

The app does not let people build their own reports or drill into the numbers. ⟨src: d:reporting⟩ A reader might assume they can filter, segment, or export bespoke analytics. The nearest in-scope behaviour is a fixed dashboard of today's totals — total bookings, no-shows, and busiest stylists — as simple counts. ⟨src: d:reporting⟩

### No file or photo attachments

The app does not allow files or photos to be attached to any record. ⟨src: d:attachments⟩ A reader might assume style reference photos can be uploaded to an Appointment or Client Record. The nearest in-scope behaviour is text-only fields on those records. ⟨src: n:n1, n:n5⟩

### No custom intake forms or custom fields

The app does not support custom fields, per-service intake questions, or private staff notes. ⟨src: d:customization, d:booking_intake_form, d:booking_customer_records⟩ A reader might assume they can add allergy or preference questions per Service. The nearest in-scope behaviour is that booking collects the Client's name and contact details only, and the salon may adjust branding — logo, colours, wording — but not the workflow. ⟨src: d:booking_intake_form, d:customization⟩

### No multi-language, multi-currency, or multi-time-zone handling

The app does not present multiple languages, currencies, or time zones. ⟨src: d:localization, d:booking_time_zones⟩ A reader might assume clients in another region see localized times or prices. The nearest in-scope behaviour is one language, one country, one currency, and a single salon-local time zone applied everywhere. ⟨src: d:localization, d:booking_time_zones, d:booking_pricing_variation⟩

### No public pages or open sign-up

The app does not publish public marketing pages or public client-created content, and does not allow open self-signup for staff. ⟨src: d:public_facing, d:invite_flow⟩ A reader might assume there is a public landing site or that stylists register themselves. The nearest in-scope behaviour is account-gated access, with staff and stylists added by an admin invitation and Clients holding their own portal accounts. ⟨src: d:external_access, d:invite_flow⟩

## Glossary

Definitions of every actor and noun used across this specification. Each term is defined once here to prevent concept drift; other sections use these exact terms.

### Actors

- **Client** — A customer who books hair services online, holding their own account with sign-in by email and password. ⟨src: p1⟩ ⟨src: d:booking_who_books⟩ ⟨src: d:identity_provider⟩
- **Stylist** — A hairdresser who provides services, keeps their own schedule, and edits their own Working Hours and Time Off. ⟨src: p2⟩ ⟨src: d:booking_staff_schedule_control⟩
- **Salon Manager** — The owner/admin who runs the salon and manages Stylists, Services, and salon Working Hours. ⟨src: p3⟩ ⟨src: d:roles⟩
- **Receptionist** — Staff who handle walk-ins and adjust bookings on behalf of Clients. ⟨src: p4⟩ ⟨src: d:booking_walk_ins⟩

### Nouns

- **Appointment** — A booked 1:1 time slot reserving one Stylist's time for one Client and one Service on a date and time, with a status. ⟨src: n1⟩ ⟨src: d:booking_slot_capacity⟩ ⟨src: d:booking_resource_model⟩
- **Service** — A treatment the salon offers, defined by name, duration, single price, and category. ⟨src: n2⟩ ⟨src: d:booking_service_catalog⟩ ⟨src: d:booking_pricing_variation⟩
- **Stylist Profile** — A hairdresser's details and the set of Services they offer, including name, working days, and bio. ⟨src: n3⟩
- **Working Hours** — The weekly available window (day of week, start time, end time) for the salon and for each Stylist. ⟨src: n4⟩ ⟨src: d:booking_availability_rules⟩
- **Client Record** — A customer record holding contact details plus all past and future visits for a returning Client. ⟨src: n5⟩ ⟨src: d:booking_customer_records⟩
- **Time Off** — A dated block (start date to end date, with reason) during which a Stylist is unavailable for booking. ⟨src: n6⟩
- **Cancellation** — A record that an Appointment was cancelled, capturing who cancelled it, the reason, and the time cancelled. ⟨src: n7⟩ ⟨src: r11⟩
- **Reminder** — A message sent to a Client before their Appointment, with a send time, channel, and delivery status, from which the Client may confirm the Appointment. ⟨src: n8⟩ ⟨src: d:booking_reminders⟩

### Supporting terms

- **Buffer** — A fixed gap applied after every Appointment before the next slot may start; default 0 minutes until the Salon Manager configures it. ⟨src: d:booking_buffers⟩ ⟨src: default⟩
- **No-show** — A status staff record against an Appointment when the Client did not attend; counted against the Client Record. ⟨src: r13⟩ ⟨src: d:booking_no_show⟩
- **Waitlist** — A manual list a Client joins when a wanted time is full, from which staff contact them if a slot opens. ⟨src: d:booking_waitlist⟩

## Decision ledger (complete)

_Every product decision this spec is built on. "assumed" rows carry the confidence of the assumption — an implementer should confirm low-confidence assumptions before building against them (see AGENTS.md)._

| Decision | Answer | How settled | Confidence |
|---|---|---|---|
| Where do open time slots come from? ⟨src: d:booking_availability_rules⟩ | Each staff member/resource has its own weekly hours plus days off | assumed | 95% |
| Is money taken when booking? ⟨src: d:booking_prepayment⟩ | No — free, or paid in person/elsewhere | assumed | 95% |
| Who creates bookings? ⟨src: d:booking_who_books⟩ | Customers book from their own account and see their history | assumed | 95% |
| Who needs an account to use the app? ⟨src: d:user_accounts⟩ | Several people log in, possibly with different powers | assumed | 95% |
| Does it talk to Google/Outlook/Apple calendars? ⟨src: d:booking_calendar_sync⟩ | No — the app is the calendar | assumed | 96% |
| Who can cancel a booking, and until when? ⟨src: d:booking_cancellation_policy⟩ | Only staff can cancel; customers must contact the business | assumed | 95% |
| Is a booking confirmed instantly, or does someone approve it first? ⟨src: d:booking_confirmation⟩ | Instantly confirmed if the slot is free | assumed | 96% |
| Where do bookings take place? ⟨src: d:booking_locations⟩ | One location | assumed | 95% |
| What is actually being reserved? ⟨src: d:booking_resource_model⟩ | A person's time (stylist, doctor, consultant) | assumed | 95% |
| How are bookable services defined? ⟨src: d:booking_service_catalog⟩ | A menu of services, each with its own length and price | assumed | 95% |
| How many people can a single slot hold? ⟨src: d:booking_slot_capacity⟩ | One booking per slot (1:1 appointments) | assumed | 95% |
| Does it hold data with special legal handling (health, payment cards, minors)? ⟨src: d:compliance_sensitivity⟩ | Personal data needing consent/retention care (GDPR-like) | assumed | 64% |
| Do outside parties (customers, clients, vendors) use the app directly? ⟨src: d:external_access⟩ | They have their own accounts and log in | assumed | 95% |
| Does it need to connect to other tools? ⟨src: d:integrations⟩ | No | assumed | 95% |
| Where is it used? ⟨src: d:platform⟩ | In a browser, mostly on phones | assumed | 62% |
| Do different people have different powers? ⟨src: d:roles⟩ | An owner/admin plus staff with fewer powers | assumed | 95% |
| When a stylist profile is removed, what happens to their existing future appointments? ⟨src: d:x1⟩ | Force reassignment to another stylist | assumed | 93% |
| What happens when two clients try to book the same stylist slot at the same time? ⟨src: d:x2⟩ | Slot is held/locked while one is booking | assumed | 81% |
| How is availability computed around salon hours, stylist working days, and time off at day/month boundaries? ⟨src: d:x4⟩ | Slot must fit fully within salon hours AND stylist hours AND outside time off | assumed | 96% |
| Can receptionists override booking rules (book during time off, past cutoff, double-book) that clients cannot? ⟨src: d:x6⟩ | Staff may override with a warning | assumed | 96% |
| How does a service's duration map to the booking grid and stylist availability? ⟨src: d:x8⟩ | Block exact service length; next slot starts after | assumed | 81% |
| Do you need a record of who changed what and when? ⟨src: d:audit_trail⟩ | Just created/updated by whom and when | assumed | 64% |
| How much is kept about each customer? ⟨src: d:booking_customer_records⟩ | A customer record with all past and future visits | assumed | 95% |
| What must the customer fill in when booking? ⟨src: d:booking_intake_form⟩ | Just name and contact details | assumed | 53% |
| What happens when someone doesn't turn up? ⟨src: d:booking_no_show⟩ | No-shows are counted and repeat offenders must prepay or are blocked | assumed | 73% |
| Does the price of a service vary? ⟨src: d:booking_pricing_variation⟩ | One price per service | assumed | 64% |
| Can a booking repeat (every Tuesday, monthly)? ⟨src: d:booking_recurring⟩ | No — each booking is made separately | assumed | 65% |
| How are customers reminded before their booking? ⟨src: d:booking_reminders⟩ | Email and SMS, and customers can confirm or cancel from the reminder | assumed | 95% |
| Can customers move a booking themselves? ⟨src: d:booking_reschedule⟩ | No — they contact the business | assumed | 94% |
| Are customers and staff in the same time zone? ⟨src: d:booking_time_zones⟩ | Yes — one local time zone everywhere | assumed | 98% |
| What happens when the wanted time is full? ⟨src: d:booking_waitlist⟩ | They join a waitlist and staff call them if something opens | assumed | 61% |
| Do staff also add bookings and block time by hand? ⟨src: d:booking_walk_ins⟩ | Yes — walk-ins, phone bookings, holds, and blocked time | assumed | 95% |
| Can each business customize the app? ⟨src: d:customization⟩ | Branding and templates (logo, colors, wording) | assumed | 79% |
| Do you start with existing data? ⟨src: d:data_import⟩ | Import from a spreadsheet/CSV once | assumed | 77% |
| How much data will there be? ⟨src: d:data_scale⟩ | Tens of thousands | assumed | 55% |
| When something is deleted, what really happens? ⟨src: d:deletion⟩ | It's archived and can be restored | assumed | 96% |
| How do additional people get access? ⟨src: d:invite_flow⟩ | An admin invites them | assumed | 96% |
| Languages and regions? ⟨src: d:localization⟩ | One language, one country | assumed | 97% |
| Is any part visible to the public without logging in? ⟨src: d:public_facing⟩ | No | assumed | 95% |
| What do people need to see across many records? ⟨src: d:reporting⟩ | A dashboard with totals and counts | answered | 100% |
| How are duplicate booking submissions (double-click, retry) handled? ⟨src: d:x3⟩ | Detect and collapse into one appointment | assumed | 96% |
| Can a cancelled appointment be reinstated/undone? ⟨src: d:x5⟩ | Restore only if the slot is still open | assumed | 96% |
| Can files/photos be attached to things? ⟨src: d:attachments⟩ | No | assumed | 53% |
| Is there gap time between appointments? ⟨src: d:booking_buffers⟩ | A fixed gap after every booking | assumed | 56% |
| Who edits staff working hours and time off? ⟨src: d:booking_staff_schedule_control⟩ | Each staff member edits their own hours; admin sees all | assumed | 95% |
| What happens when two people edit the same thing at once? ⟨src: d:concurrency⟩ | Common; the app must prevent or merge conflicting edits | assumed | 92% |
| Do people need to get their data out? ⟨src: d:data_export⟩ | Download lists as CSV/Excel | assumed | 96% |
| How do people sign in? ⟨src: d:identity_provider⟩ | Email + password | assumed | 81% |
| How long is data kept? ⟨src: d:retention⟩ | Until someone deletes it | assumed | 64% |
| If a booking is confirmed but the reminder/notification fails to send, what happens? ⟨src: d:x7⟩ | Booking stands; reminder retried/flagged | assumed | 71% |
