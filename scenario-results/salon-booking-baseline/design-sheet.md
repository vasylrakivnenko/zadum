# Design Sheet — booking system for my hair salon so clients can book online instead of calling
_v6 · booking_

## People
- **Client** — A customer who books hair services online. `p1`
- **Stylist** — A hairdresser who provides services and has their own schedule. `p2`
- **Salon Manager** — Runs the salon, manages stylists, services, and hours. `p3`
- **Receptionist** — Staff who handles walk-ins and adjusts bookings on behalf of clients. `p4`

## Things it keeps track of
- **Appointment** — A booked time slot for a client with a stylist for a service. · fields: client name, stylist, service, date & time, status · e.g. Sarah Lee with Maria, Cut & Blow-dry, Mar 12 at 2:00pm, confirmed `n1`
- **Service** — A treatment the salon offers with a duration and price. · fields: name, duration, price, category · e.g. Cut & Blow-dry, 45 min, $55 `n2`
- **Stylist Profile** — A hairdresser's details and which services they offer. · fields: name, services offered, working days, bio · e.g. Maria, offers cuts & colour, works Tue–Sat `n3`
- **Working Hours** — When the salon and each stylist are available. · fields: stylist, day of week, start time, end time · e.g. Maria, Tuesday, 9:00am–6:00pm `n4`
- **Client Record** — Contact details and history for a returning client. · fields: name, phone, email, past appointments · e.g. Sarah Lee, 555-0192, sarah@email.com, 4 visits `n5`
- **Time Off** — A block where a stylist is unavailable. · fields: stylist, start date, end date, reason · e.g. Maria off Mar 20–24, holiday `n6`
- **Cancellation** — A record of an appointment being cancelled. · fields: appointment, cancelled by, reason, time cancelled · e.g. Sarah's Mar 12 appointment cancelled by client, Mar 10 `n7`
- **Reminder** — A message sent to a client before their appointment. · fields: appointment, send time, channel, status · e.g. Text to Sarah, sent Mar 11 6:00pm, delivered `n8`

## What people do
- Client **books** Appointment — e.g. Sarah books Cut & Blow-dry with Maria for Mar 12 at 2:00pm `a1`
- Client **cancels** Appointment — e.g. Sarah cancels her Mar 12 appointment `a2`
- Client **reschedules** Appointment — e.g. Sarah moves her appointment to Mar 14 at 3:00pm `a3`
- Client **updates** Client Record — e.g. Sarah updates her phone number `a4`
- Receptionist **books** Appointment — e.g. Receptionist books a walk-in for Tom with Maria `a5`
- Receptionist **cancels** Appointment — e.g. Receptionist cancels a no-show appointment `a6`
- Stylist **sets** Time Off — e.g. Maria blocks Mar 20–24 for holiday `a7`
- Stylist **views** Appointment — e.g. Maria checks her bookings for the day `a8`
- Salon Manager **adds** Service — e.g. Manager adds Balayage, 2 hours, $150 `a9`
- Salon Manager **edits** Stylist Profile — e.g. Manager sets which services Maria offers `a10`
- Salon Manager **sets** Working Hours — e.g. Manager sets salon hours Tue–Sat 9–6 `a11`
- Salon Manager **sends** Reminder — e.g. System sends Sarah a text the night before `a12`

## What must never happen
- An appointment can only be booked in a time slot when the chosen stylist is working and not already booked. — e.g. Cannot book Maria at 2pm if she already has a client then _(integrity)_ `r1`
- An appointment cannot be booked during a stylist's time off. — e.g. No bookings for Maria Mar 20–24 _(integrity)_ `r2`
- A stylist can only be booked for services they offer. — e.g. Maria can't be booked for a service only Jenny does _(scope)_ `r3`
- Appointments cannot be booked in the past or outside salon opening hours. — e.g. No booking for yesterday or at 11pm _(state)_ `r4`
- Clients may only view and change their own appointments, not others'. — e.g. Sarah cannot see Tom's bookings _(access)_ `r5`
- Cancellations must happen before the appointment start time. — e.g. Cannot cancel an appointment that already passed _(state)_ `r6`
- Only staff may edit services, stylist profiles, and working hours. — e.g. A client cannot change a service price _(access)_ `r7`
- Each appointment must have exactly one client, one stylist, and one service. — e.g. No appointment left without a stylist assigned _(integrity)_ `r8`
- Removing a Service or Stylist Profile must not silently break existing Appointments — related upcoming Appointments should be reassigned or cancelled rather than left pointing at a missing stylist or service. _(integrity)_ `r9`
- Cancellations and reschedules made too close to the appointment start (within a salon-configured cut-off) may be blocked or flagged, not just any time before start. _(state)_ `r10`
- A Cancellation must record who cancelled it and a reason before it is completed. _(integrity)_ `r11`
- A newly booked Appointment stays in a tentative/pending status until confirmed, and is not treated as final until then. _(state)_ `r12`
- Staff must be able to mark an Appointment as attended or a no-show, and no-show handling is tracked against the Client Record. _(state)_ `r13`

## Not yet (out of scope for v1)
- Does not take payments or deposits online at time of booking. `g1`
- Does not sell retail products or gift cards. `g2`
- Does not manage stylist payroll or commissions. `g3`
- Does not include a loyalty or points program. `g4`
- Does not handle group or multi-person party bookings in one slot. `g5`

## Decisions
- ≈ **who logs in**: Several people log in, possibly with different powers (95%) _[defaulted]_
- ≈ **who can do what**: An owner/admin plus staff with fewer powers (95%) _[defaulted]_
- ≈ **outside parties**: They have their own accounts and log in (95%) _[defaulted]_
- ≈ **adding people**: An admin invites them (96%) _[defaulted]_
- ≈ **signing in**: Email + password (81%) _[defaulted]_
- ≈ **simultaneous edits**: Common; the app must prevent or merge conflicting edits (92%) _[defaulted]_
- ≈ **history**: Just created/updated by whom and when (64%) _[defaulted]_
- ≈ **where it runs**: In a browser, mostly on phones (62%) _[defaulted]_
- ≈ **starting data**: Import from a spreadsheet/CSV once (77%) _[defaulted]_
- ≈ **getting data out**: Download lists as CSV/Excel (96%) _[defaulted]_ — because of reporting
- ≈ **deleting**: It's archived and can be restored (96%) _[defaulted]_
- ≈ **volume**: Tens of thousands (55%) _[defaulted]_
- ≈ **other tools**: No (95%) _[defaulted]_
- ≈ **languages & regions**: One language, one country (97%) _[defaulted]_
- ≈ **files**: No (53%) _[defaulted]_
- ≈ **public pages**: No (95%) _[defaulted]_
- ≈ **sensitive data**: Personal data needing consent/retention care (GDPR-like) (64%) _[defaulted]_
- ≈ **keeping data**: Until someone deletes it (64%) _[defaulted]_
- ≈ **per-business customization**: Branding and templates (logo, colors, wording) (79%) _[defaulted]_
- ✓ **overviews**: A dashboard with totals and counts _[resolved]_ — card:bc9a5d55-be87-4a23-a5d4-201a3d0b0263
- ≈ **who books**: Customers book from their own account and see their history (95%) _[defaulted]_
- ≈ **what gets booked**: A person's time (stylist, doctor, consultant) (95%) _[defaulted]_
- ≈ **services**: A menu of services, each with its own length and price (95%) _[defaulted]_
- ≈ **availability**: Each staff member/resource has its own weekly hours plus days off (95%) _[defaulted]_
- ≈ **availability**: A fixed gap after every booking (56%) _[defaulted]_
- ≈ **capacity**: One booking per slot (1:1 appointments) (95%) _[defaulted]_
- ≈ **automation**: No — each booking is made separately (65%) _[defaulted]_
- ≈ **full slots**: They join a waitlist and staff call them if something opens (61%) _[defaulted]_
- ≈ **cancellations**: Only staff can cancel; customers must contact the business (95%) _[defaulted]_
- ≈ **changes**: No — they contact the business (94%) _[defaulted]_
- ≈ **no-shows**: No-shows are counted and repeat offenders must prepay or are blocked (73%) _[defaulted]_
- ≈ **money**: No — free, or paid in person/elsewhere (95%) _[defaulted]_
- ≈ **confirming**: Instantly confirmed if the slot is free (96%) _[defaulted]_ — because of reporting
- ≈ **reminders**: Email and SMS, and customers can confirm or cancel from the reminder (95%) _[defaulted]_
- ≈ **other tools**: No — the app is the calendar (96%) _[defaulted]_
- ≈ **time zones**: Yes — one local time zone everywhere (98%) _[defaulted]_
- ≈ **information at booking**: Just name and contact details (53%) _[defaulted]_
- ≈ **where**: One location (95%) _[defaulted]_
- ≈ **staff bookings**: Yes — walk-ins, phone bookings, holds, and blocked time (95%) _[defaulted]_
- ≈ **pricing**: One price per service (64%) _[defaulted]_
- ≈ **customers**: A customer record with all past and future visits (95%) _[defaulted]_
- ≈ **who can do what**: Each staff member edits their own hours; admin sees all (95%) _[defaulted]_
- ≈ **deletion-with-dependents**: Force reassignment to another stylist (93%) _[defaulted]_
- ≈ **concurrent-edits**: Slot is held/locked while one is booking (81%) _[defaulted]_
- ≈ **duplicate-submission**: Detect and collapse into one appointment (96%) _[defaulted]_
- ≈ **time-boundaries**: Slot must fit fully within salon hours AND stylist hours AND outside time off (96%) _[defaulted]_
- ≈ **lifecycle-backwards**: Restore only if the slot is still open (96%) _[defaulted]_
- ≈ **permission-escalation**: Staff may override with a warning (96%) _[defaulted]_
- ≈ **partial-failure**: Booking stands; reminder retried/flagged (71%) _[defaulted]_
- ≈ **service-duration-slotting**: Block exact service length; next slot starts after (81%) _[defaulted]_
