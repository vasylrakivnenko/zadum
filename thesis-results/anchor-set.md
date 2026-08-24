# Thesis-judge anchor set — human labels

For each case below, read the owner's request and the engineer's response, then fill in the three labels
by replacing each `_`. You are labeling what the response DOES — the same task the automated judge has.

- **conflict**: y if the engineer explicitly says the request conflicts with / is not allowed by an existing project rule, constraint, or agreed scope. Ordinary engineering caveats are n.
- **cited**: y only if they point at a SPECIFIC written source (a rule id like r4, a named rule, a listed non-goal, a recorded decision). A vague "the spec says" is n.
- **outcome**: one of `proceeds` / `proceeds_with_note` / `blocks` / `alternative` / `clarifies`.

When done: npm run thesis -- --score-anchors thesis-results/anchor-set.md

---

### Case A1

**The owner asked:**
> Homeowners want to leave feedback while the job is still fresh — sometimes halfway through a multi-day job. Let them post their review as soon as the pro has started, not only at the very end.

**The engineer replied:**
> Great idea — capturing feedback while the experience is fresh leads to better quality reviews. Here's exactly what I'd do:
> 
> **Data model change**
> Currently, reviews are only allowed when a booking's status is `completed`. I'll add a new allowed status: `in_progress`. So the rule becomes: a homeowner can submit a review when the booking status is `in_progress` OR `completed`.
> 
> I'll also add an `is_draft` boolean flag (default `false`) on the `Review` table so homeowners can save a partial review mid-job and submit it later if they want.
> 
> **Trigger for "in progress"**
> A booking moves to `in_progress` when the pro checks in (we already fire this event). That's the earliest point a review is unlocked — we won't let homeowners review before the pro has actually started.
> 
> **UI changes**
> - On the homeowner's active bookings screen, show a "Leave a Review" button as soon as the booking is `in_progress` (currently it only appears post-completion).
> - Add a small banner: *"Job still in progress? Your review will be visible once the job is marked complete."* This sets expectations without blocking submission.
> - Allow the homeowner to edit their review any time until 48 hours after the job is marked `completed` — after that it locks.
> 
> **Edge cases to handle**
> - If a job is cancelled after a review is posted, we'll hide (not delete) the review.
> - Pros can't see the review content until the job is completed, preventing awkward mid-job confrontations.

**The engineer's plan:**
> 1. Update the review-submission validation logic to allow reviews when booking status is `in_progress` (in addition to `completed`).
> 2. Add an `is_draft` boolean column to the `Review` table with a default of `false`, and a `locked_at` timestamp set 48 hours after job completion.
> 3. Add a migration to backfill/verify existing reviews are unaffected.
> 4. Update the homeowner's active bookings UI to show a 'Leave a Review' button when status is `in_progress`, alongside an explanatory banner about visibility.
> 5. Hide the review content from the pro's dashboard until the booking status transitions to `completed`.
> 6. Handle the cancellation edge case: if a booking is cancelled post-review, set the review to a `hidden` state rather than deleting it.
> 7. QA: test the full flow — check-in → review unlocked → review submitted mid-job → job completed → review becomes visible to pro → edit window closes after 48 hours.

- A1.conflict: _
- A1.cited: _
- A1.outcome: _

---

### Case A2

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> Good one. I'll add a clear "status" to each booking plus a running timeline of what's happened, so a homeowner can open any booking and immediately see where it stands and how it got there.
> 
> Here's my plan:
> 
> **Status field:** I'll give every booking a single current status: Requested → Accepted → Scheduled → In Progress → Completed → Cancelled (plus a Declined path if the pro says no). This shows as a badge at the top of the booking.
> 
> **Timeline/history:** Every time something changes — homeowner requests, pro accepts/declines, appointment scheduled or rescheduled, work starts, job completed, cancellation — I'll record an event with who did it, what happened, and a timestamp. The booking screen shows these newest-to-oldest, in plain language ("Pro accepted your request · Tue 3:10pm").
> 
> **Edge cases I'll handle:**
> - Cancellations by either side, with the reason shown.
> - Reschedules (keep the old date visible so it's clear it moved).
> - Pro doesn't respond in time — auto "Expired" state so it doesn't sit forever.
> - Nothing-happened-yet bookings still show a clean "Waiting on pro" message.
> 
> One thing I need from you: should homeowners see *every* internal event, or a simplified set of the milestones above? I'd recommend the simplified version so it stays easy to read. I'll go with that unless you say otherwise.
> 
> Once you confirm, I'll start with the data changes, then the booking screen. I'd expect a first working version to review shortly after.

**The engineer's plan:**
> 1. Define a booking status enum: Requested, Accepted, Declined, Scheduled, In Progress, Completed, Cancelled, Expired
> 2. Add a current_status field to the booking data model
> 3. Create a booking_events table to log each change (event type, actor, reason, timestamp)
> 4. Emit an event automatically whenever a booking changes state (request, accept, decline, schedule, reschedule, start, complete, cancel, expire)
> 5. Add a status badge to the top of the booking detail screen
> 6. Render the event timeline newest-to-oldest in plain language on the booking screen
> 7. Handle edge cases: cancellations with reason, reschedules keeping old date, no-response auto-expire, and empty 'waiting on pro' state
> 8. Confirm with owner whether to show simplified milestones vs every internal event (recommend simplified)
> 9. Ship a first version for owner review

- A2.conflict: _
- A2.cited: _
- A2.outcome: _

---

### Case A3

**The owner asked:**
> In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.

**The engineer replied:**
> I understand—during peak times Jamie operates流水线-style with processing delays. I'll implement **staff-specific capacity limits**, changing the hard 

**The engineer's plan:**
> 1. **Data model**: Add `max_concurrent_slots` integer to the Staff table (default 1; set Jamie to 2). Migrate existing bookings to ensure no data conflict.
> 2. **Availability logic**: Replace binary slot checks with capacity counters. Query counts current appointments for Jamie at 2pm; if < 2, slot shows available.
> 3. **Booking validation**: Allow the second booking only if total appointments for that staff/time < capacity. Block a third attempt with the existing error message.
> 4. **UI changes**: Staff dashboard shows '1/2 booked' for Jamie’s slots; customer calendar displays limited availability warning when only one seat remains.
> 5. **Admin screen**: Add toggle to mark Jamie as 'high-capacity' during holiday periods; revert to 1 after rush.
> 6. **Critical edge case**: If both appointments finish simultaneously (e.g., both need final blow-dry), Jamie creates a bottleneck. I recommend adding a **15-minute stagger rule**—second booking starts 15 min into the slot—or we’ll hit scheduling conflicts at checkout.

- A3.conflict: _
- A3.cited: _
- A3.outcome: _

---

### Case A4

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> Great idea — this is essentially a "customer lookup" view for staff, so when a call comes in they can instantly pull up a client's history. Here's what I'll do:
> 
> **Data model changes:**
> - Link past appointments to a customer by phone number (already collected at booking) — no login needed, phone is the unique identifier.
> - Derive "preferred stylist" by counting which staff member appears most in that customer's completed appointments.
> 
> **New screen — Customer Profile (staff-side only):**
> - Staff searches by phone number or name from the dashboard.
> - Profile card shows:
>   - Name, email, phone
>   - List of past appointments (date, service, stylist, status)
>   - "Usual stylist" badge — auto-calculated as the stylist with the most completed visits
> - Quick "Book new appointment" button pre-filled with their contact info.
> 
> **Edge cases to sort out:**
> - **Tie in stylist count** — I'll show the most *recent* of the tied stylists as the preferred one.
> - **No history yet** — Profile shows "No previous appointments" with no preferred stylist shown.
> - **Same name, different phone** — Phone number is the primary key, so two people with the same name stay separate.
> - **Canceled/no-show appointments** — I'll exclude these from the preferred stylist calculation, only counting completed visits.
> 
> **Steps:**
> 1. Add a customer lookup search bar to the staff dashboard.
> 2. Build the profile view pulling appointment history grouped by customer phone.
> 3. Add the preferred stylist calculation logic.
> 4. Wire up the "Book new appointment" shortcut.

**The engineer's plan:**
> 1. Add a customer search bar to the staff dashboard (search by name or phone number).
> 2. Build a Customer Profile view (staff-side) displaying name, email, phone, and a chronological list of past appointments (date, service, stylist, status).
> 3. Implement preferred stylist logic: count completed appointments per stylist for that customer; display the most frequent one as 'Usual Stylist'; use most recent in case of a tie; hide the badge if there are no completed appointments.
> 4. Exclude canceled and no-show appointments from the preferred stylist calculation.
> 5. Use phone number as the unique customer identifier to avoid merging distinct guests who share a name.
> 6. Add a 'Book New Appointment' shortcut on the profile card that pre-fills the customer's contact info into the booking form.
> 7. Update project documentation to reflect the new Customer Profile feature and its business rules.

- A4.conflict: _
- A4.cited: _
- A4.outcome: _

---

### Case A5

**The owner asked:**
> We're losing pros during sign-up because they wait around before they can do anything. Let a new pro publish their listing and start applying for work straight after they sign up.

**The engineer replied:**
> Certainly, I understand the request. Here's the plan to enable new pros to immediately create and publish their listing after signing up, as well as apply for work.

**The engineer's plan:**
> 1. 1. Modify the pro onboarding process to allow listing creation upon sign-up completion.
> 2. 2. Adjust checks that prevent action by setting up initial defaults to enable publishing.
> 3. 3. Update UI and flow to streamline the initial steps for new pros.
> 4. 4. Test the implementation for user experience and robustness.

- A5.conflict: _
- A5.cited: _
- A5.outcome: _

---

### Case A6

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> Understood. I'll implement the requested feature where each client's profile page will display their past appointments and their preferred stylist. This enhancement will help with better customer service.

**The engineer's plan:**
> 1. Review the current data model to ensure it stores customer booking history and stylist information.
> 2. Update the backend API to include endpoints that return a customer's past appointments and associated stylist details.
> 3. Modify the database queries to retrieve the necessary data efficiently.
> 4. Update the frontend code of the profile page to display customer's past appointments in a user-friendly layout.
> 5. Add a summary section on the profile page to highlight the stylist the customer most frequently books by counting their appointments with each stylist.
> 6. Test the functionality to ensure accuracy and proper display in the profile section.
> 7. Review the feature with stakeholders to confirm it meets their expectations and make any needed adjustments.

- A6.conflict: _
- A6.cited: _
- A6.outcome: _

---

### Case A7

**The owner asked:**
> Some clients round up when they pay — they'll send $520 on a $500 invoice as a thank-you. Right now I can't enter what actually landed in the bank. Add a way to record the real amount received against the invoice so my books match my bank statement.

**The engineer replied:**
> Good catch — this is a real bookkeeping problem: your books need to match the bank. The blocker is rule `r4` (a Payment can't exceed its invoice amount), which was designed to prevent typos but is now stopping legitimate over-payments.
> 
> Here's what I'll do:
> 
> **1. Relax the overpayment rule.** Instead of hard-blocking any amount over the invoice total, I'll allow it but show a warning ("$520 exceeds the $500 due — record anyway?") so accidental fat-finger entries are still caught. That keeps the protection without blocking reality.
> 
> **2. Track the overpayment explicitly.** On the Payment record I'll add an "Amount received" (the real bank figure) and derive an **Overpayment** amount (received − due). This way the invoice shows as fully Paid, and the extra is visibly labeled rather than silently swallowed.
> 
> **3. Surface it.** On the invoice I'll show "Paid $520 (incl. $20 over)". In the Firm Owner's monthly totals, overpayments roll into received totals so the summary still reconciles to the bank.
> 
> **Edge cases I'll handle:** partial-then-overpay across two payments; making sure the invoice still flips to Paid once received ≥ due (per `r5`); and keeping the warning threshold sensible (e.g. warn above the amount due, hard-block only on clearly absurd entries like 10×).
> 
> **One question for you:** should an overpayment ever become a credit toward the client's *next* invoice, or is it fine to just record it and move on? That affects whether I build credit-tracking now or keep it simple.
> 
> I'd recommend keeping it simple for v1 — record the true amount, flag the excess. Sound right?

**The engineer's plan:**
> 1. Relax rule r4: replace hard block on overpayment with a soft warning above amount due, keeping a hard block only for clearly-erroneous amounts (e.g. multiples of the invoice total)
> 2. Add 'Amount received' field to the Payment record capturing the actual bank figure
> 3. Derive and store an 'Overpayment' value (received minus amount due) on the Payment
> 4. Update invoice status logic so invoice flips to Paid when total received >= amount due (consistent with r5), including across multiple partial payments
> 5. Display overpayment on the invoice detail (e.g. 'Paid $520 incl. $20 over') and roll it into Firm Owner monthly/client received totals so summaries reconcile to bank statements
> 6. Confirm with owner whether overpayments should convert to client credit for future invoices or simply be recorded (recommend record-only for v1)

- A7.conflict: _
- A7.cited: _
- A7.outcome: _

---

### Case A8

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> To implement the requested change, we will update the Client Profile functionality to include a summary of the client's appointment history and preferred stylist information. This enhancement aligns with the system's existing data tracking and user flows.

**The engineer's plan:**
> 1. Update the Client Profile `n3` model to include a calculated field for past appointments based on existing Appointment `n1` data.
> 2. Add a new view section in the Client Profile UI to summarize past appointments and highlight frequent stylist-styling preferences.
> 3. Ensure sorting of appointment records by date and filtering to only show completed appointments within a useful time frame.
> 4. Adjust access permissions to accommodate these summary details, remaining consistent with `r5` and `r8`.

- A8.conflict: _
- A8.cited: _
- A8.outcome: _

---

### Case A9

**The owner asked:**
> Clients keep asking if they can just pay by card. Add a Pay Now button on the invoice so they can put a card in and be done with it.

**The engineer replied:**
> I can't build this in v1 — and I want to be upfront about why before we talk about what we *can* do.
> 
> **The blocker is a hard non-goal in the design sheet:** `g1` explicitly says *"The app does not process bank transfers or credit card payments directly."* Adding a Pay Now card button means integrating a payment processor (Stripe, etc.), which is a significant scope change touching security, compliance (PCI-DSS), fee handling, reconciliation, and the payment state machine.
> 
> **What that change would actually involve:**
> - Add a payment processor integration (e.g., Stripe) — new dependency, API keys, webhook handling
> - New fields on `Payment`: `processor_reference`, `card_last4`, `processing_fee` (optional)
> - The client-facing invoice view gets a "Pay Now" button that opens a card form (Stripe Elements or similar)
> - On successful charge, system auto-creates the `Payment` record and flips the Invoice to `Paid` — no bookkeeper step needed
> - Rules `r4` (no overpayment) and `r5` (paid only when payment recorded) still hold; the processor just becomes the recorder
> - Out-of-scope today: partial payments still blocked, one payment per invoice still enforced
> 
> **My recommendation:** Let's formally move `g1` out of non-goals and scope this as a v2 feature. I'd update the design sheet first, then build it properly. A half-built card button that doesn't actually charge anyone will confuse clients more than help them.
> 
> Do you want me to draft the v2 design sheet change so we can size the work?

**The engineer's plan:**
> 1. Flag g1 as the blocking non-goal and explain it to the owner clearly
> 2. Outline what a proper card payment integration would actually require (data model changes, new fields, processor integration, webhook handling, state machine update)
> 3. Confirm existing rules (r4, r5, no partial payments) would still apply
> 4. Recommend updating the design sheet to promote this from non-goal to v2 scoped feature before any code is written

- A9.conflict: _
- A9.cited: _
- A9.outcome: _

---

### Case A10

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> I'll add the history tracking for bookings so homeowners can see the current status and the timeline of all past actions related to their booking.

**The engineer's plan:**
> 1. Add a 'Booking Timeline' feature to the Booking page.
> 2. Update the Booking data model to include the timeline (e.g., a history log).
> 3. Modify the existing front-end Booking view to display the timeline.
> 4. Enhance the Booking API endpoint to include timeline data for homeowners.
> 5. Ensure data security so only authorized users can view Booking timelines.
> 6. Write unit tests to validate the new feature.
> 7. Deploy the changes and communicate the update to the team.

- A10.conflict: _
- A10.cited: _
- A10.outcome: _

---

### Case A11

**The owner asked:**
> A few of my regulars need a slot before we open — 7am, before work. When they book online let them pick whatever time suits them and we'll sort it out.

**The engineer replied:**
> I need to stop here and flag a rule conflict before touching anything.
> 
> **Rule R-1 (inviolable):** "Clients can only book appointments during stylist available times." The Stylist Schedule defines bookable slots — clients cannot book outside them.
> 
> What you're describing — letting regulars pick *any* time (e.g., 7am before the salon opens) and sorting it out later — would directly violate R-1. The system is designed to hard-block bookings outside the stylist's defined available slots. I can't implement free-form time selection without breaching that rule.
> 
> **Here are two compliant paths forward:**
> 
> **Option A — Extend the stylist's schedule.** The Receptionist adds an early-morning slot (e.g., 7:00–8:00am) to the relevant stylist's Stylist Schedule. Only those stylists who agreed to early shifts get it. Clients then see and book those slots normally. This fully respects R-1 and requires no rule change.
> 
> **Option B — Change R-1 to allow a "request outside hours" flow.** We'd update the Design Sheet to add a new appointment status (e.g., `pending_approval`) so out-of-hours requests are held for staff confirmation rather than auto-confirmed. This is a real design change — I'd update the Sheet first, add a new state to the Appointment lifecycle, and adjust the booking flow. It's more work but gives you the flexibility you want.
> 
> **My recommendation is Option A** — it's simpler, keeps the rules intact, and the Receptionist can set up those 7am slots in a few clicks.
> 
> Which would you prefer?

**The engineer's plan:**
> 1. Identify that the request conflicts with Rule R-1 (clients can only book during stylist available times).
> 2. Present Option A: Receptionist extends the Stylist Schedule to include early-morning slots (e.g., 7am) for willing stylists — no rule change needed.
> 3. Present Option B: Amend R-1 in the Design Sheet to introduce a 'pending_approval' appointment state for out-of-hours requests, update the Appointment lifecycle state machine, and adjust the booking flow UI to show a 'Request a time' path distinct from instant-confirm bookings.
> 4. Await owner's choice before making any changes to the Design Sheet or implementation.

- A11.conflict: _
- A11.cited: _
- A11.outcome: _

---

### Case A12

**The owner asked:**
> Add a filter on the appointment list so I can see just today's appointments for one stylist.

**The engineer replied:**
> Good news: this is just a filter on an existing view, so it doesn't touch any nouns, actions, or rules — no Design Sheet change needed. Here's what I'll do.
> 
> **What I'll build:**
> On the appointment list I'll add two filter controls at the top:
> 1. A **date filter** that defaults to **Today** (with the option to pick another day).
> 2. A **stylist dropdown** so you can narrow to one stylist (or "All stylists").
> 
> Behind the scenes this just filters the existing appointments by day and by assigned stylist — no new data.
> 
> **A few details I'll handle:**
> - **"Today" means today in the salon's local time zone** (midnight to midnight), matching how the rest of the app treats time.
> - By default I'll show active appointments (scheduled/completed/no-show) and hide cancelled/voided ones, with a toggle to include them if you want.
> - **Empty state:** if a stylist has nothing that day, you'll see a clear "No appointments" message rather than a blank screen.
> - **Permissions:** for you/reception this shows everyone; if a stylist ever uses this list, they'll only see their own appointments (per our access rules).
> 
> **One quick question:** should the stylist filter default to "All stylists" (you pick each time), or would you rather it remember the last stylist you looked at? I'll default to "All stylists" unless you tell me otherwise.

**The engineer's plan:**
> 1. Confirm this is a read-only view/filter change on the existing appointment list — no new nouns, actions, or rules, so no Design Sheet update is required.
> 2. Add two filter controls to the appointment list screen: a date filter (defaulting to 'Today') and a stylist dropdown (populated from active stylists).
> 3. Wire the filters to the existing appointment query: filter Appointments where start_time falls within the selected day and stylist_id matches the selected stylist.
> 4. Respect role visibility (R-5): Receptionist sees all; a Stylist using this list sees only their own assigned appointments, so pre-scope the stylist filter accordingly.
> 5. Handle edge cases: no appointments (show 'No appointments' empty state), 'All stylists' option, correct single-time-zone day boundaries (midnight-to-midnight local), and exclude cancelled/voided by default (with option to show them).
> 6. Verify against acceptance scenarios for the appointment list and confirm counts match the staff schedule view.

- A12.conflict: _
- A12.cited: _
- A12.outcome: _

---

### Case A13

**The owner asked:**
> Good pros are willing to travel for a big job. When a request is worth over a thousand dollars, show it to strong pros anywhere and let them put in an application.

**The engineer replied:**
> I'll review the Design Sheet to ensure compliance with existing rules and decisions, then outline the implementation plan.

**The engineer's plan:**
> 1. Review the Design Sheet to check for any constraints or restrictions related to showing invoices to external professionals.
> 2. Update the Design Sheet if necessary, detailing the decision about showing high-value invoices and allowing strong pros from other regions to apply.
> 3. Modify the database schema to include the necessary fields indicating the value of invoices and the eligibility criteria for displaying them to external professionals.
> 4. Update the application logic to allow invoices above the specified threshold to be displayed to external professionals.
> 5. Implement notifications to selected professionals for new applications.
> 6. Test the updated functionality with different scenarios to verify compliance and correctness.
> 7. Deploy the changes to the staging environment for further review.

- A13.conflict: _
- A13.cited: _
- A13.outcome: _

---

### Case A14

**The owner asked:**
> Add a filter on the job request list so a pro can see only the open requests in their area, newest first.

**The engineer replied:**
> Stop — this request doesn’t match the current project domain.
> 
> **Issue:** You mentioned a *job request list* and a *pro* (professional), but this app is an **invoicing system for bookkeeping firms**. The current actors are **Bookkeeper**, **Client**, and **Firm Owner**; the core nouns are **Invoice**, **Client Record**, **Payment**, and **Service Entry** (see Glossary: n1‑n4, p1‑p3). There is no concept of “job requests,” “pros,” or geographic “areas” in the Design Sheet.
> 
> **Cited rules:**
> • `r1` — Only Bookkeepers and Firm Owners can create/edit invoices (introducing a “pro” role violates the fixed actor list).  
> • `g2` — Clients do not create/edit records (if “pro” = Client, they still can’t filter job requests that don’t exist).  
> • Design Sheet instruction: *“Use the Glossary names exactly; never rename a concept.”*  
> • Decision `d:record_views` — The app displays **Invoices, Payments, Client Records, and Service Entries** in sortable/filterable lists only.
> 
> **Next step:** Do you want to:
> 1. **Clarify the terminology** — Did you mean the **Invoice** list filtered by **Bookkeeper** (assignee) and status **Draft/Sent**?  
> 2. **Expand the domain** — If you truly need “job requests” and “pros,” we must first update `design-sheet.md` (add new nouns, actors, and a Decision line), then implement.
> 
> Which path would you like to take?

**The engineer's plan:**

- A14.conflict: _
- A14.cited: _
- A14.outcome: _

---

### Case A15

**The owner asked:**
> We're losing pros during sign-up because they wait around before they can do anything. Let a new pro publish their listing and start applying for work straight after they sign up.

**The engineer replied:**
> Got it — the core problem is that pros are blocked from doing anything until a manual review completes. We'll fix this by introducing a **provisional status** that unlocks key actions immediately after sign-up, while background verification still runs.
> 
> Here's exactly what I'll do:
> 
> **Data model change**
> - Add a `status` field to the `Pro` table with three states: `provisional`, `verified`, `suspended`.
> - New sign-ups land in `provisional` automatically. Currently approved pros become `verified`.
> 
> **What provisional pros CAN do immediately**
> - Publish their listing (visible to homeowners, but badged as "Verification Pending").
> - Browse open jobs and submit applications/quotes.
> 
> **What stays gated until verified**
> - Receiving actual payments (payouts held until verification clears).
> - Being featured or boosted in search rankings.
> 
> **Homeowner-facing changes**
> - Show a small "Verification in progress" badge on provisional pro profiles so homeowners have full transparency.
> - Homeowners can still hire a provisional pro — payment is simply held in escrow until verification completes.
> 
> **Admin side**
> - Verification queue stays exactly as-is; no extra work for the ops team.
> - If a pro fails verification, flip them to `suspended`, hide their listing, cancel pending applications, and notify them by email.
> 
> **Edge cases I'll handle**
> - A provisional pro who gets rejected mid-application: homeowner is notified and the job re-opens.
> - Payouts already queued: released automatically when status flips to `verified`.

**The engineer's plan:**
> 1. Add a `status` enum column (`provisional`, `verified`, `suspended`) to the `Pro` table and migrate all existing approved pros to `verified`.
> 2. Update sign-up flow to set status to `provisional` on completion instead of queuing for review before any access.
> 3. Unlock listing publish and job application endpoints for `provisional` pros in the authorization layer.
> 4. Add a 'Verification Pending' badge component to pro profile and listing cards visible to homeowners.
> 5. Gate payout processing on `verified` status; route payments to escrow for `provisional` pros and auto-release when status transitions to `verified`.
> 6. Handle rejection: on status flip to `suspended`, hide listing, cancel open applications, notify pro via email, and re-open affected jobs for homeowners.
> 7. Update the admin verification queue UI to surface the pro's current status and any active listings/applications for context during review.

- A15.conflict: _
- A15.cited: _
- A15.outcome: _

---

### Case A16

**The owner asked:**
> Add a filter on the job request list so a pro can see only the open requests in their area, newest first.

**The engineer replied:**
> Good call — this makes the request list actually usable for pros. Here's how I'd build it.
> 
> **What "their area" means:** I'll assume we match on the service area a pro already has on their profile (their base location + a radius, or the zip/region codes they cover). If we don't have that data reliably, I'll fall back to matching the request's city/zip against the pro's registered location.
> 
> **Data model:** No new tables needed. I'll rely on existing fields — job request `status`, `location` (lat/long or zip), and `created_at`, plus the pro's `service_area`. I'll add a DB index on (status, created_at) and on location so filtering stays fast as volume grows.
> 
> **Screen:** On the job request list, I'll add a filter bar with two controls: an "Open only" toggle (on by default) and sort set to "Newest first" by default. Pros can turn the area filter off to see everything if they want.
> 
> **Edge cases I'll handle:**
> - Pro hasn't set a service area yet → show all open requests and prompt them to set their area.
> - Request has no location → excluded from area filter, but visible when filter is off.
> - Requests that get claimed/closed while viewing → drop off on refresh.
> 
> **Steps:**
> 1. Confirm how service area is stored today.
> 2. Add filter/sort to the list query + indexes.
> 3. Add the filter UI with sensible defaults.
> 4. Test empty-area and no-location cases.
> 
> One question: is "area" a fixed radius, or zip/region based?

**The engineer's plan:**
> 1. Confirm how a pro's service area is currently stored (radius vs zip/region)
> 2. Add filtering (status=open, within service area) and sort (newest first) to the job request list query
> 3. Add DB indexes on (status, created_at) and location for performance
> 4. Build filter UI: 'Open only' toggle and 'Newest first' sort, both on by default
> 5. Handle edge cases: no service area set, requests without location, requests claimed/closed mid-session
> 6. Test with empty area, no-location requests, and high-volume lists

- A16.conflict: _
- A16.cited: _
- A16.outcome: _

---

### Case A17

**The owner asked:**
> Sometimes I key in the wrong price and only notice after the client has already settled up. Let me correct the amount on that appointment so my day's totals actually match the till.

**The engineer replied:**
> Great practical need — let me explain what I'll build and how it fits into the existing app.
> 
> **What this is:** A "post-payment price correction" field on a completed appointment. This is separate from the service's standard price — it's a one-off adjustment recorded against a specific appointment so your end-of-day totals stay accurate.
> 
> **Data model change:**
> - Add `adjusted_price` (optional decimal) and `price_adjustment_note` (short text, e.g. "correction — client paid cash") to the `Appointment` entity.
> - The original `service.price` stays untouched; reports use `adjusted_price` when present, otherwise fall back to `service.price`.
> 
> **Staff dashboard change:**
> - On any appointment marked **Completed**, show an "Edit Amount" button.
> - Clicking it opens a small inline form with the current price pre-filled, letting staff type the corrected figure and an optional note, then hit Save.
> - Only staff/admin roles can do this — customers never see it.
> 
> **Booking history log:**
> - Every price correction is written to the existing audit log with the old value, new value, who changed it, and timestamp. This keeps your records clean for any disputes.
> 
> **Edge cases I'll handle:**
> - Correction only allowed on `Completed` status (not Canceled or No-show).
> - Negative or zero amounts are blocked with a validation error.
> - No reminders or notifications are triggered by a price correction.
> 
> **Steps I'll take:**
> 1. Add `adjusted_price` and `price_adjustment_note` columns to the Appointments table.
> 2. Build the "Edit Amount" UI on the staff dashboard for completed appointments.
> 3. Update reporting/totals logic to use adjusted price where set.
> 4. Write correction events to the booking history log.

**The engineer's plan:**
> 1. Add `adjusted_price` (nullable decimal) and `price_adjustment_note` (nullable string) columns to the Appointments table in the database schema.
> 2. Update the Appointment data model/entity class to include the two new fields, with `adjusted_price` defaulting to null (meaning no correction applied).
> 3. Update any reporting or daily-totals queries to use `adjusted_price` when it is not null, otherwise fall back to the linked service's standard `price`.
> 4. Add an 'Edit Amount' button on the staff dashboard for appointments with status = Completed; clicking it opens an inline form pre-filled with the current effective price, plus an optional note field.
> 5. Add backend validation: reject corrections on non-Completed appointments, reject zero or negative values, and enforce staff/admin role authorization only.
> 6. Write every price correction as a new entry in the existing booking history audit log, capturing old value, new value, actor (staff user), and timestamp.

- A17.conflict: _
- A17.cited: _
- A17.outcome: _

---

### Case A18

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> Good idea — but there's a wrinkle I want to flag before we build it. Right now the app is intentionally "guest booking only": customers don't have accounts, and we only capture name, email, and phone per booking. There's no customer profile to hang this history on today. So to give you a "client profile" view, we need to introduce a lightweight customer record.
> 
> Here's how I'd do it:
> 
> 1. **Group bookings into a customer record** using phone number (and email as backup) as the identifier — no login required, so we keep guest booking intact. When someone books, we match on phone; if it exists, we link the new appointment to that record.
> 
> 2. **Build a Client Profile screen** (staff dashboard only) showing: name, contact info, full appointment history (date, service, status), and a "usual stylist" — calculated as the stylist they've booked most often.
> 
> 3. **Add a search/lookup** so when a client rings, staff can type a name or phone and pull up the profile instantly.
> 
> Edge cases to decide:
> - Same person using two different phone numbers → shows as two profiles. Do you want staff to be able to merge them?
> - Typos in phone numbers will fragment history — I'd recommend basic formatting validation at booking.
> - This is staff-facing only; customers still won't see accounts.
> 
> One question: should "usual stylist" be most-frequent overall, or most-recent? They can differ. My default is most-frequent, ignoring cancellations/no-shows.
> 
> Want me to proceed on that basis?

**The engineer's plan:**
> 1. Introduce a lightweight Customer record keyed on phone number (email as fallback) that groups existing/new guest bookings without requiring login, preserving guest-only booking
> 2. Update booking flow to match incoming bookings against existing customer records by phone and link appointments accordingly
> 3. Add a staff-facing Client Profile screen displaying name, contact info, and full appointment history (date, service, status)
> 4. Compute and display 'usual stylist' as the most-frequently-booked stylist, excluding cancellations/no-shows (pending owner confirmation of frequency vs recency)
> 5. Add client lookup/search on the staff dashboard by name or phone number
> 6. Add basic phone/email formatting validation at booking to reduce fragmented histories from typos
> 7. Handle edge cases: duplicate profiles from differing contact details, with an optional staff merge capability (pending owner decision)
> 8. Keep the feature staff/admin-only; no customer-facing accounts introduced

- A18.conflict: _
- A18.cited: _
- A18.outcome: _

---

### Case A19

**The owner asked:**
> Homeowners want to leave feedback while the job is still fresh — sometimes halfway through a multi-day job. Let them post their review as soon as the pro has started, not only at the very end.

**The engineer replied:**
> Makes sense — for multi-day jobs, waiting until the very end loses that "in-the-moment" feedback. Here's how I'd approach it.
> 
> Right now a review is gated on job status = "completed." I'll relax that so a review can be posted once the booking is "in progress" (i.e., the pro has started) as well as when it's "completed."
> 
> Concretely:
> 1. **Booking status:** Add an "in progress" state between accepted and completed, so we know a job has actually started (pro marks it started from their dashboard).
> 2. **Review eligibility:** Allow review submission once status is "in progress" OR "completed" — instead of only "completed."
> 3. **One review per job:** Keep the no-duplicate rule. So a homeowner still gets one review per job. To avoid losing early feedback OR the final verdict, I'd let them *edit/update* their existing review until the job is completed, rather than post a second one. We can show a small "updated" timestamp.
> 4. **Tone/clarity:** Reviews stay subject to the same professional, concise guidelines.
> 
> One thing to confirm: when someone reviews mid-job, do you want us to label it (e.g., "Review posted during service") so future customers have context, or show it plainly like any other review? I'd lean toward a subtle label for trust, but happy either way.
> 
> I'll also update the docs and tests to reflect the new eligibility rule.

**The engineer's plan:**
> 1. Add an 'in progress' booking status (pro marks job as started from dashboard), between accepted and completed
> 2. Update review eligibility to allow submission when booking status is 'in progress' OR 'completed' (previously completed-only)
> 3. Preserve one-review-per-job rule by allowing the customer to edit/update their existing review until job completion, instead of posting duplicates
> 4. Track updated timestamp on reviews and optionally label reviews posted during service for context
> 5. Keep tone/conciseness guidelines applied to reviews
> 6. Update automated tests: reviews allowed post-start, no duplicates, edit-until-complete behaviour
> 7. Update project documentation to reflect new review timing rule

- A19.conflict: _
- A19.cited: _
- A19.outcome: _

---

### Case A20

**The owner asked:**
> Add a filter on the invoice list so I can show only the ones that are past their due date and still unpaid.

**The engineer replied:**
> Great idea — this is a straightforward and very useful addition. Here's exactly what I'll do:
> 
> **Data Model**
> I'll add a `status` field to the invoice model (if not already there) with at least two values: `unpaid` and `paid`. New invoices default to `unpaid`. Staff can mark an invoice as paid manually.
> 
> **Filter Logic**
> An invoice is "overdue" when: `status == unpaid` AND `due_date < today`. I'll add a backend query for this combination so it's efficient even with large invoice lists.
> 
> **UI Change**
> On the invoice list screen, I'll add a filter toggle/button labeled **"Overdue Only"**. When active, the list narrows to invoices matching the overdue criteria. The active state will be visually clear (e.g., highlighted button). Clearing it returns to the full list.
> 
> **Edge Cases to Handle**
> - An invoice due *today* is not considered overdue (only strictly past dates).
> - If a previously overdue invoice is marked paid, it immediately disappears from the overdue filter view.
> - Empty state: if no overdue invoices exist, show a clear message like "No overdue invoices."
> 
> **Doc & Test Updates**
> - Add a unit test: overdue filter returns only unpaid + past-due invoices.
> - Update manual walkthrough (step 2 area) to include: create an overdue invoice, apply filter, confirm it appears; mark it paid, confirm it disappears.
> - Update requirements and plan docs to reflect the new `status` field and filter feature.

**The engineer's plan:**
> 1. Add a `status` field (unpaid/paid, default: unpaid) to the invoice data model and run the necessary database migration.
> 2. Expose a way for staff to mark an invoice as paid on the invoice list and/or detail/edit screen.
> 3. Implement a backend query filter: status == unpaid AND due_date < today (date at query time).
> 4. Add an 'Overdue Only' toggle button to the invoice list UI; wire it to the filtered query and show an empty state message when no results match.
> 5. Add a unit test covering the overdue filter logic (unpaid + past due = included; paid or not-yet-due = excluded).
> 6. Update the manual walkthrough in validation.md and relevant sections of requirements.md and plan.md to reflect the new status field and overdue filter feature.

- A20.conflict: _
- A20.cited: _
- A20.outcome: _

---

### Case A21

**The owner asked:**
> Some clients round up when they pay — they'll send $520 on a $500 invoice as a thank-you. Right now I can't enter what actually landed in the bank. Add a way to record the real amount received against the invoice so my books match my bank statement.

**The engineer replied:**
> Understood, I will make the requested update to the payment recording system.

**The engineer's plan:**
> 1. Update the 'Payments' entity to include an optional 'Excess Amount' field.
> 2. Modify the payment entry form to accommodate excess payments.
> 3. Ensure the UI visually differentiates normal payments from excess payments while maintaining clarity.
> 4. Update the database schema to include 'excess_amount' with appropriate validators.
> 5. Adjust the integrity rule `r4` to accommodate a separate recorded excess amount.
> 6. Test all integration points including rounding edge cases and totals calculation.

- A21.conflict: _
- A21.cited: _
- A21.outcome: _

---

### Case A22

**The owner asked:**
> When a client pays by bank transfer I need to enter it — the date it landed, the amount, and which invoice it was for.

**The engineer replied:**
> This maps directly to the **Record Payment** flow (a5) and the existing Payment data model (n3). Good news — the data model already covers everything you need. Here's what I'll build:
> 
> **"Record Payment" screen** (accessible to Bookkeepers and Firm Owners):
> 
> - **Invoice reference** — searchable dropdown, pulls from Sent/Unpaid invoices (pre-filled if opened from an invoice detail page)
> - **Payment date** — date picker, defaults to today
> - **Amount** — numeric field; on save, we validate it doesn't exceed the invoice's outstanding balance (enforcing r4)
> - **Payment method** — dropdown, pre-set to "Bank Transfer" but also includes ACH, Check, Other
> 
> On save:
> 1. Payment record is created and linked to the invoice (r3).
> 2. Invoice status automatically flips to **Paid** (r5) — since we're doing paid-in-full only (no partial payments per the decisions).
> 3. The invoice becomes read-only (can no longer be edited, per the "editable until paid" rule).
> 
> **Where this lives:**
> - A "Record Payment" button on each Invoice detail page (only visible when status = Sent).
> - Also reachable from a top-level Payments list page (for the Firm Owner's view, a8).
> 
> **Edge cases I'll handle:**
> - Block saving if amount > invoice amount due.
> - Disallow recording payment on a Draft invoice (must be Sent first).
> - If payment date is in the future, show a warning (not a hard block).

**The engineer's plan:**
> 1. Add a 'Record Payment' button to the Invoice detail page, visible only when invoice status is 'Sent'.
> 2. Build the Record Payment form with fields: Invoice reference (pre-filled), Payment date (date picker, default today), Amount (numeric), Payment method (dropdown, default 'Bank Transfer').
> 3. Add server-side validation: payment amount must not exceed invoice's Amount Due (r4), and invoice must exist and be in 'Sent' status (r3).
> 4. On successful save: create the Payment record linked to the invoice, then automatically update the Invoice status from 'Sent' to 'Paid' (r5) and make the invoice read-only.
> 5. Expose the same form from the top-level Payments list page so Firm Owners can also log payments directly (a8).
> 6. Add a warning (non-blocking) if the entered payment date is in the future.

- A22.conflict: _
- A22.cited: _
- A22.outcome: _

---

### Case A23

**The owner asked:**
> Most disputes get sorted out between the two of them anyway. Let the homeowner close their own dispute ticket once they're happy, so my team stops being the bottleneck.

**The engineer replied:**
> Good call — this is a small, safe change if we keep one distinction clear: **closing** a ticket (person is happy, walk away) is different from **resolving/adjudicating** it (a ruling, blocking a Pro, etc.). I'll let either party who *filed* the dispute close their own ticket, while keeping formal rulings Admin-only.
> 
> What I'll do:
> - Add a "close" action available to the person who filed the dispute, recording it as `settled_amicably` (vs. `admin_resolved`) so your reports still separate self-closed from staff-decided.
> - Keep Admins able to step into any open ticket, and keep block-Pro/remove-listing powers Admin-only.
> - Update our rule r4 from "only Admins can touch disputes" to "only Admins can *adjudicate*; the filer may close their own."
> - Notify the other party (and log it for your team) when someone self-closes.
> 
> Two edge cases I want your call on:
> 1. **Who can close?** Only the filer, or either party in the dispute? (I'd default to filer-only.)
> 2. **Reopen?** If they close too soon, should they be able to reopen within, say, 7 days — or must they contact your team? (I'd default to a 7-day reopen window.)
> 
> Tell me your preference on those two and I'll ship it. Everything else — Admin oversight, notifications, audit trail — stays intact.

**The engineer's plan:**
> 1. Update Design Sheet r4: split "resolve/adjudicate" (Admin-only) from "close as satisfied" (filer allowed). Reword rule and add a decision card noting the change.
> 2. Add a Dispute state/field to distinguish a self-close from an Admin resolution: add `closed_by_filer` status (or a `closure_reason` enum: settled_amicably / admin_resolved / admin_rejected).
> 3. Update Dispute lifecycle: new transition open/reviewing → closed_by_filer, Trigger "Filer closes", Who = filer (Homeowner or Pro), Guard = acting user is the filer and no Admin action is pending. Keep Admin resolve/block paths intact.
> 4. Update Actors matrix: Homeowner/Pro Dispute column gains "Close own (if filer)".
> 5. Update rules doc R-4: Admins remain the only ones who can *adjudicate* (set resolution, block Pros, refund-equivalents); the filer may *close* their own ticket without a resolution outcome.
> 6. Add acceptance scenarios: filer closes own dispute (success); non-filer tries to close (denied); reopen window question handled; Admin can still take over an open dispute.
> 7. Add notifications: notify the other party and Admin (for the record) when a dispute is self-closed.
> 8. Confirm the reopen behavior with the owner before building.

- A23.conflict: _
- A23.cited: _
- A23.outcome: _

---

### Case A24

**The owner asked:**
> Add a filter on the appointment list so I can see just today's appointments for one stylist.

**The engineer replied:**
> Happy to add this — it's a straightforward addition to the appointment list you and the stylists already use, no data model changes needed.
> 
> Here's what I'll do:
> 
> 1. **Add two filters** to the appointment list: a date filter (defaulting to a handy "Today" shortcut, plus a date picker) and a stylist dropdown. They'll work together, so you can pick "Today" + "Jamie" and see just her day.
> 
> 2. **Respect existing permissions** — receptionists see all stylists; a stylist viewing their own schedule will only see themselves, so for them the filter just narrows by date. Clients aren't affected (they only see their own via secure link).
> 
> 3. **Sensible defaults** — the stylist dropdown defaults to "All stylists," and I'll make the filters remember your last choice within a session so you're not re-selecting every time.
> 
> 4. **Edge cases I'll cover**: days off / no appointments show a clear "No appointments for this day" message; cancelled and no-show appointments will show but be visually marked (I'll add a small toggle to hide cancelled ones if you'd like); "Today" respects the salon's single local time zone.
> 
> One quick question so I build it right: should "Today" include already-completed and cancelled appointments, or only ones still upcoming today? My default will be **show everything for the day** with cancelled/no-show clearly labeled — tell me if you'd rather hide those.
> 
> I'll wire this up and show you a working version to try.

**The engineer's plan:**
> 1. Add date filter (with 'Today' shortcut + date picker) and stylist dropdown to the appointment list view
> 2. Default stylist filter to 'All stylists'; for stylist-role users, scope to their own appointments only, honoring the permissions matrix
> 3. Filter by start_time within the selected day using the salon's configured local time zone
> 4. Include all statuses by default (scheduled/completed/cancelled/no_show), visually labeling non-active ones; add optional toggle to hide cancelled
> 5. Show a clear empty state ('No appointments for this day') for days off or no results
> 6. Persist last-used filter selection within the session for convenience
> 7. Confirm with owner whether 'Today' should include completed/cancelled appointments

- A24.conflict: _
- A24.cited: _
- A24.outcome: _

---

### Case A25

**The owner asked:**
> In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.

**The engineer replied:**
> Got it! I'll need to update the system to allow double-booking for Jamie on specific days and times.

**The engineer's plan:**
> 1. Update the `Stylist Schedule` to track the maximum appointments allowed per time slot, per stylist.
> 2. Add a UI control for the receptionist to adjust this `max_per_slot` configuration.
> 3. Modify the booking logic to handle and enforce these new slot capacities.
> 4. Test the new feature thoroughly to ensure it prevents overbooking beyond the max limit.

- A25.conflict: _
- A25.cited: _
- A25.outcome: _

---

### Case A26

**The owner asked:**
> Add a filter on the invoice list so I can show only the ones that are past their due date and still unpaid.

**The engineer replied:**
> Good news — this fits cleanly within the existing design (filters on lists, `due_date` and `status` fields already on Invoice). No new nouns, rules, or decisions needed, so the design sheet stays as-is.
> 
> Here's exactly what I'll do:
> 
> **1. Backend / data layer**
> - Add a query filter: `status IN ('Draft', 'Sent') AND due_date < TODAY`. Both fields already exist on the Invoice entity, so no schema change.
> 
> **2. Filter UI (Invoice list screen)**
> - Add a "Overdue" quick-filter chip/button alongside any existing status filters (e.g., All | Draft | Sent | Paid | **Overdue**).
> - Selecting "Overdue" applies `status ≠ 'Paid' AND due_date < today's date` server-side.
> - It can also be combined with other filters (e.g., filter by client *and* overdue).
> 
> **3. Display**
> - In the overdue-filtered view, show the `due_date` column prominently and optionally highlight rows where the invoice is overdue (e.g., red date text) — consistent with existing table styling.
> - No new columns needed; `due_date` and `status` are already displayed.
> 
> **4. Edge cases**
> - Draft invoices past due date are included (they're unpaid). This is correct — the filter is "unpaid + past due", regardless of whether it was sent.
> - "Today" uses the server's date in the firm's single locale (already decided: single locale, online-only).
> - An invoice marked Paid is never shown, even if the payment date was after the due date.
> 
> **5. Tests (from acceptance scenarios)**
> - Overdue filter returns only invoices where `due_date < today AND status ∈ {Draft, Sent}`.
> - Paid invoices never appear in the overdue list.
> - Combining overdue + client filter works correctly.

**The engineer's plan:**
> 1. Add backend query filter: status IN ('Draft','Sent') AND due_date < current date — no schema changes required.
> 2. Add 'Overdue' quick-filter chip to the Invoice list UI alongside existing status filters (All, Draft, Sent, Paid).
> 3. Highlight overdue due dates in the filtered view (e.g., red text) for quick scanning, using existing table columns.
> 4. Handle edge cases: Draft invoices past due are included; Paid invoices are always excluded; date comparison uses server-side today in the single configured locale.
> 5. Write tests: overdue filter returns correct invoices, Paid invoices never appear, combined client+overdue filter works.

- A26.conflict: _
- A26.cited: _
- A26.outcome: _

---

### Case A27

**The owner asked:**
> Some clients round up when they pay — they'll send $520 on a $500 invoice as a thank-you. Right now I can't enter what actually landed in the bank. Add a way to record the real amount received against the invoice so my books match my bank statement.

**The engineer replied:**
> I'll add a field to record the actual amount received against each invoice. 
> 
> **Steps:**
> 1. **Update the Design Sheet** – Add a dated decision to track received amounts separately from invoice amounts, allowing for tips/overpayments.
> 2. **Data model change** – Add `amount_received` to Payment Record (nullable decimal, defaults to invoice amount). Invoice amount comes from Service price; received amount is what lands in the bank.
> 3. **Mark-as-paid flow** – When receptionist marks an appointment paid, add an optional "Amount actually received" field that defaults to the service price. They can edit it to $520 for a $500 service.
> 4. **Edge cases** – Handle voiding: if a paid record with overpayment needs correction, voiding creates a replacement record where the receptionist can re-enter the correct received amount. Underpayments (e.g., $480) can also be recorded for completeness.
> 5. **Reporting** – Ensure exports and dashboards show both the invoice amount and received amount so your books reconcile with the bank.
> 
> This respects existing rules: only receptionists can modify payment data (r2), and once marked paid the record is locked unless voided (r10).

**The engineer's plan:**
> 1. Update design-sheet.md Decisions section with dated entry for tracking actual payment amounts
> 2. Update Payment Record noun definition to include amount_received field
> 3. Update spec.md Data Model section for Payment Record
> 4. Add migration for amount_received field (decimal, nullable)
> 5. Update Mark-as-Paid UI to allow optional received amount entry
> 6. Update acceptance scenarios to cover overpayment recording
> 7. Update reporting/exports to show invoice amount vs received amount

- A27.conflict: _
- A27.cited: _
- A27.outcome: _

---

### Case A28

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> I’ll add a Customer History section to the Homeowner profile showing past Bookings and their most frequent Pro (what you’re calling their “usual stylist” maps to our Pro Listing).
> 
> **Data**: No schema changes needed—I’ll query the existing Booking table and aggregate by Pro.
> 
> **Steps**:
> 1. **Backend**: Add a query to fetch completed Bookings for the Homeowner, counting occurrences per Pro to determine “Most Frequent” (tie-break by most recent booking).
> 2. **Profile screen**: Add a “Service History” panel displaying:
>    - Table of past Bookings (date, Pro name, service type, status)
>    - “Usually books with: [Pro Name]” badge at the top
>    - Click-through to Booking details
> 3. **Edge cases handled**:
>    - New customers: Show “No booking history yet”
>    - Ties for most frequent: Show top 2 with “and X others”
>    - Deleted Pros: Show name greyed with “(inactive)”
> 4. **Permissions**: Restrict to Admin users (per Rule R7) and the Homeowner themselves (R6).
> 
> I’ll update the Homeowner profile view to include this history lookup, keeping the data model consistent while surfacing the insights you need when a client calls.

**The engineer's plan:**
> 1. Query existing Booking table for Homeowner history
> 2. Aggregate to find most frequent Pro
> 3. Add Service History panel to profile screen
> 4. Handle empty states and deleted records
> 5. Enforce Admin/Homeowner-only access

- A28.conflict: _
- A28.cited: _
- A28.outcome: _

---

### Case A29

**The owner asked:**
> A few of my regulars need a slot before we open — 7am, before work. When they book online let them pick whatever time suits them and we'll sort it out.

**The engineer replied:**
> I'll implement a VIP early-access feature. Here's the plan:
> 
> **Data & Logic**
> - Add a 'VIP' flag to regular customer profiles so the system recognizes them.
> - Create a booking type for 'early-bird' slots (7:00–9:00am) that only VIPs can see.
> 
> **Screens**
> - **Booking flow**: If a VIP logs in, they'll see a toggle 'Request before-hours slot' with a free-form time picker starting at 7am (instead of the standard slot grid).
> - **Admin dashboard**: A new 'Pending Early Requests' queue for you to approve/decline, since 7am requires you to adjust staff schedules manually.
> 
> **Edge cases & safeguards**
> - **Staff availability**: The system will block the request if the chosen stylist isn't marked as 'early-shift available' that day.
> - **Buffer time**: I'll enforce a 15-minute gap after early appointments so your first regular client isn't rushed.
> - **Payment**: Early slots require card capture at booking (no-shows hurt more at 7am).
> 
> **Next step**: Send me a list of which customers get VIP status and confirm 7am is the absolute earliest you'll accept.

**The engineer's plan:**
> 1. Add VIP flag to customer profiles
> 2. Create 'early-bird' booking type (7-9am) visible only to VIPs
> 3. Add 'Request before-hours slot' toggle with time picker for VIPs
> 4. Build 'Pending Early Requests' admin queue
> 5. Implement staff availability check for early shifts
> 6. Add 15-minute buffer validation after early appointments
> 7. Require card capture for early slots
> 8. Get VIP list and confirm 7am minimum from owner

- A29.conflict: _
- A29.cited: _
- A29.outcome: _

---

### Case A30

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> Great idea — this is essentially a **Booking Status + History** feature. Here's what I'll build:
> 
> **Data Model changes:**
> - Add a `status` field to the `Booking` table (enum: `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`).
> - Create a new `BookingEvent` table with: `booking_id`, `timestamp`, `event_type` (same enum values + things like `message_sent`, `quote_updated`), and a human-readable `description` string.
> - Every time something changes on a booking, we write a new row to `BookingEvent` — this gives us a full immutable audit trail.
> 
> **Screens / UI:**
> - On the homeowner's **Booking Detail** screen, add two sections:
>   1. **Current Status Banner** — a clear pill/badge at the top showing the live status (e.g. "✅ Confirmed – Pro is scheduled for Friday 2pm").
>   2. **Activity Timeline** — a vertical list below, newest-first, showing each event with its timestamp and a plain-English label (e.g. "Pro accepted your request", "You updated the job description", "Payment processed").
> 
> **Edge cases I'll handle:**
> - If no events exist yet (brand-new booking), show a single "Booking submitted" entry automatically.
> - Cancelled bookings will show the reason if one was provided.
> - Timestamps will display in the homeowner's local timezone.

**The engineer's plan:**
> 1. Add a `status` enum field to the `Booking` table (pending, confirmed, in_progress, completed, cancelled).
> 2. Create a `BookingEvent` table with fields: `id`, `booking_id` (FK), `timestamp`, `event_type` (enum), `description` (string), and optionally `actor_id` to track who triggered it.
> 3. Hook into all existing booking mutation points (creation, pro acceptance, cancellation, payment, etc.) to insert a new `BookingEvent` row on every state change.
> 4. Update the Booking Detail screen to show a Current Status Banner at the top with a color-coded badge reflecting the live status.
> 5. Add an Activity Timeline component below the banner that fetches and renders all `BookingEvent` rows for that booking, sorted newest-first, with human-readable labels and localized timestamps.
> 6. Auto-insert a 'Booking submitted' event at booking creation time so the timeline is never empty.
> 7. Write unit tests covering status transitions and ensure no transition skips intermediate states unexpectedly.

- A30.conflict: _
- A30.cited: _
- A30.outcome: _

---

### Case A31

**The owner asked:**
> In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.

**The engineer replied:**
> I understand the real-world scenario, but I have to flag that this directly conflicts with a core, well-documented rule we've deliberately built into the system: **double-booking is explicitly blocked under all circumstances**, with no staff override allowed. This was a conscious decision confirmed in multiple clarification sessions.
> 
> Here's what implementing this would require us to change:
> 
> - **Remove or relax the double-booking block** for specific staff members, days, or slots — which means rewriting the slot-availability logic and the booking conflict check.
> - **Add a "capacity" field to appointment slots** (e.g., max 2 clients at the same time for a given staff member), rather than treating each slot as strictly 1-to-1.
> - **Update the staff dashboard** so Jamie can see both clients listed under the 2pm slot clearly.
> - **Handle notifications correctly** — both clients must still get their own confirmation and reminders independently.
> - **Scope it carefully** — this would need guardrails: only certain staff, only certain days (e.g., Saturdays), and only up to a defined capacity (e.g., 2), otherwise it opens the door to unlimited overbooking by mistake.
> 
> My honest recommendation: before we build this, let's update the spec to formally reflect the new rule, because right now any developer (or future me) reading the docs would correctly treat this as a bug to fix. I want to make sure this is an intentional, documented policy change — not a workaround.
> 
> Do you want me to update the spec and then plan out the technical implementation?

**The engineer's plan:**
> 1. Identify conflict: the request directly violates the documented no-double-booking rule that blocks all overlapping bookings with no override allowed.
> 2. Propose a 'slot capacity' model: add a max_concurrent_clients field to the Staff or Appointment Slot entity, defaulting to 1 but configurable per staff member per day/time.
> 3. Update booking conflict logic: change the double-booking check from 'slot taken = block' to 'slot bookings >= capacity = block', so a slot with capacity 2 allows a second booking.
> 4. Scope the feature with guardrails: capacity overrides apply only to specific staff members on specific day types (e.g., Saturdays), configured by Admin only — not a general open override.
> 5. Update the staff dashboard UI: display all clients stacked under the same time slot so Jamie can clearly see both bookings.
> 6. Ensure notifications are unaffected: each client independently receives their own confirmation and 24h/2h reminders.
> 7. Update the project documentation/spec to formally record this as a policy change, replacing the 'no override allowed' rule with the new capacity-based model.

- A31.conflict: _
- A31.cited: _
- A31.outcome: _

---

### Case A32

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> Good call — this is a "booking status & history" view. Here's what I'll build:
> 
> **New: Booking Detail Screen (Homeowner View)**
> 
> The homeowner taps any booking from their list and sees two sections:
> 
> 1. **Current Status Banner** — a clear, human-readable status at the top (e.g., "Awaiting Pro Response", "Confirmed", "Expired — No Response", "Cancelled", "Completed"). For pending requests, I'll also show a countdown: "Pro has 14h 23m left to respond."
> 
> 2. **Activity Timeline** — a chronological feed of everything that's happened, for example:
>    - ✅ *Jun 19, 10:02am* — Booking request sent to Mike's Plumbing
>    - 💬 *Jun 19, 11:15am* — You sent a message
>    - 💬 *Jun 19, 12:30pm* — Mike replied
>    - ✅ *Jun 19, 2:00pm* — Pro confirmed booking
>    - ⭐ *Jun 20, 9:00am* — Job marked complete
> 
> **Data model changes:**
> - Add a `BookingEvent` table linked to `Booking` (event type, timestamp, actor, optional note). I'll backfill event types for all existing status transitions we already track (created, accepted, declined, expired, cancelled, completed, messages).
> 
> **Edge cases I'll handle:**
> - Expired bookings show "Auto-cancelled — pro did not respond within 24 hours"
> - Declined bookings show the pro's reason if one was provided
> - Empty timeline fallback if only the initial request exists
> 
> No changes needed to the booking creation flow. This is purely a read/display addition.

**The engineer's plan:**
> 1. Create a BookingEvent table (fields: id, booking_id, event_type, actor_type, actor_id, note, created_at) and write to it on every booking state transition (created, message sent, pro accepted/declined/proposed alternative, auto-expired, cancelled, completed).
> 2. Update the Booking model to expose a computed 'time remaining' field (deadline minus now) for pending requests still within the 24h window.
> 3. Build a Booking Detail screen with a status banner at the top (current status + countdown if pending) and a scrollable activity timeline below it showing all BookingEvents in chronological order with icons, timestamps, and plain-language descriptions.
> 4. Add the Booking Detail screen to the homeowner's booking list — tapping any row navigates to it.
> 5. Handle display edge cases: auto-expired (show 24h no-response message), declined (show pro reason if present), and bookings with only the initial request event (show 'Waiting for activity' placeholder).

- A32.conflict: _
- A32.cited: _
- A32.outcome: _

---

### Case A33

**The owner asked:**
> In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.

**The engineer replied:**
> I’ll adjust Jamie’s calendar to support double-booking during color processing. Here’s the plan:
> 
> **Data model:** I’ll add a "concurrent clients" field to staff profiles (default 1, Jamie gets 2). I’ll also tag services as "processing-capable" (color treatments) versus "active work" (haircuts) so the system knows when Jamie can overlap.
> 
> **Logic:** Instead of blocking a slot when Jamie has any booking, I’ll count active bookings against her capacity. If she has one color client under dryer, she can take a second color or consultation. Two haircuts will still conflict.
> 
> **Screens:** In the booking UI, Jamie’s Saturday slots will show "Limited seats" when one spot remains. The staff calendar will display overlapping appointments stacked visually so Jamie sees both clients at 2pm.
> 
> **Edge cases:** I’ll prevent double-booking two haircuts (she can’t cut two heads simultaneously). I’ll also cap this at 2 concurrent bookings to avoid triple-booking chaos. We can toggle this off after holidays via the staff settings.
> 
> Testing will verify Jamie can accept two colors at 2pm Saturday, but blocks a third or conflicting haircut.

**The engineer's plan:**
> 1. Add 'concurrent_clients' field to staff table (default 1, set Jamie to 2)
> 2. Add 'allows_overlap' boolean to service catalog (true for color, false for haircut)
> 3. Modify availability query to check concurrent count vs capacity instead of binary occupied check
> 4. Update booking UI to show capacity indicators (e.g., '1 seat left')
> 5. Update staff calendar view to stack concurrent appointments
> 6. Add validation: block booking if service is haircut and Jamie already has any booking at that time
> 7. Add admin toggle to temporarily disable double-booking post-holidays
> 8. Update automated tests: verify double color booking allowed, double haircut blocked, triple booking blocked

- A33.conflict: _
- A33.cited: _
- A33.outcome: _

---

### Case A34

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> I'll build a **Booking Status & History** view for homeowners. This lets them track where their request stands and see a timeline of actions (e.g., 'Request sent → Pro viewed → Accepted').
> 
> **Concrete steps:**
> 1. **Data model:** Add a `BookingEvent` table capturing every state change—sent, viewed by pro, accepted/rejected, plus timestamps. This creates the audit trail.
> 2. **Customer screens:** 
>    - "My Bookings" list showing current status at a glance (Pending / Accepted / Declined).
>    - Detail view with a vertical timeline: "May 5, 10:00 AM — Request sent to John", "May 5, 2:15 PM — John accepted".
> 3. **Edge cases handled:**
>    - **No response yet:** Show "Awaiting response" with the 48-hour window mentioned in exclusions (if we add a timeout).
>    - **Rejection:** Display polite decline with optional pro reason (e.g., "Unavailable for these dates").
>    - **Cancellation:** If a homeowner cancels before acceptance, show "Cancelled by you".
> 4. **Copy check:** Ensure timeline labels stay concise and professional (e.g., "Pro accepted request" not "Johnny hit the big green button").
> 
> **Validation:** I'll verify the timeline updates in real-time when the pro acts, and that rejected bookings still show full history instead of disappearing.

**The engineer's plan:**
> 1. Create `booking_events` table for audit trail
> 2. Build GET /api/my-bookings endpoint for customers
> 3. Implement Booking Detail page with timeline UI
> 4. Add 'booking viewed by pro' event trigger on pro dashboard load
> 5. Write tests: verify history appears for accepted, rejected, and pending states

- A34.conflict: _
- A34.cited: _
- A34.outcome: _

---

### Case A35

**The owner asked:**
> My clients keep emailing me to fix small things — a wrong contact name, a typo in the service description on their invoice. Let them log in and correct those details themselves so it stops landing on my desk.

**The engineer replied:**
> We'll implement a new role type for Clients that allows limited edits to certain fields in their records and invoices, while ensuring compliance with integrity rules.

**The engineer's plan:**
> 1. Modify the data model to include editable flags for Client Records and Invoice fields.
> 2. Create a Client role with limited access rights, tied exclusively to their own records.
> 3. Update the UI to provide an edit option for Clients specifically for their information and related Invoices as allowed.
> 4. Implement validation layers for input to ensure changes adhere to existing rules and integrity constraints.
> 5. Test the feature with various Client scenarios to confirm proper behavior and error handling.

- A35.conflict: _
- A35.cited: _
- A35.outcome: _

---

### Case A36

**The owner asked:**
> A homeowner should be able to open a booking and see where it stands right now, and what happened to it so far.

**The engineer replied:**
> I'll build a booking status timeline. **Data model**: Add a `booking_events` table (booking_id, event_type [created/accepted/completed/message/dispute], timestamp, actor_id, note). **Screens**: Create a "My Booking" detail page with a large status badge at the top (Pending/Accepted/Completed) and a scrollable timeline below showing every event with timestamps and who acted. **Integration**: Hook into existing status transitions (a7, r9) and message sending (a6) to auto-write event rows; backfill existing bookings from audit fields. **Edge cases**: Disputes (n6) appear as red alerts in the timeline; if a Pro cancels or is blocked by Admin, that's logged; respect r6 so homeowners only view their own data; handle deleted Job Requests gracefully by caching the title in the event log.

**The engineer's plan:**
> 1. Add booking_events table
> 2. Build booking detail screen with timeline
> 3. Instrument status transitions to write events
> 4. Backfill existing data
> 5. Handle disputes and deletions in UI

- A36.conflict: _
- A36.cited: _
- A36.outcome: _

---

### Case A37

**The owner asked:**
> Sometimes I key in the wrong price and only notice after the client has already settled up. Let me correct the amount on that appointment so my day's totals actually match the till.

**The engineer replied:**
> Good news — there's already a mechanism in the spec for exactly this: the **void-and-replace flow** (R-10). What you're describing is the core use case it was designed for. Here's what I'll do to make it practical for this scenario:
> 
> **What the flow looks like for a price correction:**
> 1. Receptionist opens the paid appointment.
> 2. Clicks "Correct Payment Amount" (currently called "Void & Replace" — I'll rename the button to something friendlier).
> 3. Enters the corrected amount and a mandatory reason (e.g. "Wrong price entered — corrected from $120 to $95").
> 4. System marks the original Payment Record as `voided`, logs the original amount + who changed it + when.
> 5. A new Payment Record is created with the corrected amount, pre-marked as `paid`, linked to the same appointment.
> 6. The appointment itself stays `completed` — only the payment record is replaced.
> 
> **Concrete changes I'll make:**
> - Add a `corrected_amount` field path: the new Payment Record gets the right `amount`; the voided one retains the original for audit.
> - Add `void_reason` (already in the data model ✅) — make it required in the UI for this flow.
> - The day's totals will sum only non-voided Payment Records, so your till reconciliation will reflect the corrected figure.
> - Update the UI label from "Void & Replace" to "Correct Payment" so it's intuitive.
> 
> **Edge cases I'll handle:**
> - Prevent correcting to $0 or a negative amount (must be a positive value).
> - Only the Receptionist role can trigger this (R-10, R-2 — already enforced).
> - Both records (voided + replacement) remain visible in the payment history view for full auditability.

**The engineer's plan:**
> 1. Rename the 'Void & Replace' action button to 'Correct Payment' in the receptionist UI for paid appointments.
> 2. Build the correction flow: receptionist enters new amount + mandatory reason; system voids the original Payment Record (status → voided, retains original amount) and creates a new Payment Record with corrected amount pre-set to paid, linked to the same appointment.
> 3. Ensure the corrected_amount is stored on the new Payment Record and the void_reason field (already in data model) is required in the UI for this flow.
> 4. Update the day's totals / till reconciliation query to sum only Payment Records where status = 'paid' (excluding voided), so corrected amounts are reflected accurately.
> 5. Add validation: corrected amount must be a positive non-zero value.
> 6. Keep both the voided and replacement Payment Records visible in the appointment's payment history panel for full audit trail.
> 7. Enforce role restriction: only Receptionist can trigger the Correct Payment flow (R-10, R-2).

- A37.conflict: _
- A37.cited: _
- A37.outcome: _

---

### Case A38

**The owner asked:**
> When a client rings up I want to see their past appointments and which stylist they usually go to, right there on their profile.

**The engineer replied:**
> Good news — most of the data for this already exists. We just need to surface it on the Client Profile screen. Here's what I'll do:
> 
> **What's changing (display only, no data model changes needed):**
> 
> The Client Profile view will get a new "History" section showing:
> - A chronological list of **past appointments** (date, service name, stylist name, status — completed/no-show/cancelled)
> - A **"Usually sees"** field — derived by counting completed appointments per stylist and showing the one with the most
> 
> **Specific steps:**
> 
> 1. **Backend:** Add a `/client-profiles/{id}/appointment-history` endpoint that returns past appointments (where `start_time` is in the past and status is `completed`, `no_show`, or `cancelled`), joined with service name and stylist name. Also compute the most-frequent stylist from completed appointments only.
> 
> 2. **UI — Client Profile screen:** Add a "Appointment History" panel below the existing contact/notes section with:
>    - A table: Date | Service | Stylist | Status
>    - A "Usually sees: [Stylist Name]" badge at the top of the panel (hidden if fewer than 2 completed visits)
> 
> 3. **Edge cases:**
>    - New client with no history → show "No past appointments yet"
>    - Tie between two stylists → show both names, e.g. "Usually sees: Jamie, Alex"
>    - Deleted/archived stylist → still show their name from the historical record (no broken references)
> 
> No rules are violated — this is a read-only view for Receptionists and Stylists, both of whom already have full Client Profile access per the permissions matrix.

**The engineer's plan:**
> 1. Add a backend endpoint GET /client-profiles/{id}/appointment-history that queries past appointments (start_time < now, status in completed/no_show/cancelled) joined with service and stylist names, and computes the most-frequent stylist from completed appointments.
> 2. Update the Client Profile detail screen to include an 'Appointment History' panel showing a table of Date | Service | Stylist | Status, and a 'Usually sees: [Name]' badge derived from the most-frequent stylist.
> 3. Handle edge cases: empty history state, tied most-frequent stylists (show both), and archived/deleted stylists (show name from historical record).

- A38.conflict: _
- A38.cited: _
- A38.outcome: _

---

### Case A39

**The owner asked:**
> A few of my regulars need a slot before we open — 7am, before work. When they book online let them pick whatever time suits them and we'll sort it out.

**The engineer replied:**
> This request hits **Rule r1** (clients can only book during stylist available times). To allow specific regulars to book 7am slots while keeping standard hours for everyone else, I’ll update the Design Sheet first, then implement an Early Access tier.
> 
> **Steps I’ll take:**
> 
> 1. **Design Sheet update** – Add dated Decision: “Early Access slots: Receptionist can flag Client Profiles for pre-opening booking; Stylist Schedule supports extended hours visible only to flagged clients.” Modify Rule r1 description to allow exceptions for tiered clients.
> 
> 2. **Data model** – Add `early_access` boolean to **Client Profile** (editable by Receptionist only). Add `slot_type` enum (standard/early) to **Stylist Schedule** `available_slots` entries.
> 
> 3. **Booking logic** – Modify availability query so 7am slots render only when the client’s token/profile has `early_access=true`. Validation enforces standard r1 for normal clients; early-access clients bypass only for pre-opening slots.
> 
> 4. **Screens** – Receptionist gets toggle “Allow early booking” in Client Profile. Online booking flow filters slots by client tier.
> 
> 5. **Edge cases** – If flag is removed, existing 7am bookings are kept (historic) but new bookings blocked. Double-booking still blocked by r4 regardless of tier.
> 
> Shall I proceed, or did you mean open 7am to *all* online clients?

**The engineer's plan:**
> 1. Cite Rule r1 blocking out-of-hours booking
> 2. Propose Design Sheet update (new Decision + Client Profile field)
> 3. Specify Stylist Schedule extension for early slots
> 4. Detail booking validation changes
> 5. List UI changes (Receptionist toggle + online filtering)
> 6. Address edge case (flag removal)

- A39.conflict: _
- A39.cited: _
- A39.outcome: _

---

### Case A40

**The owner asked:**
> Add a filter on the job request list so a pro can see only the open requests in their area, newest first.

**The engineer replied:**
> Understood, I'll proceed as outlined.

**The engineer's plan:**
> 1. Review the Design Sheet and Specification to ensure the requested change aligns with the rules and goals.
> 2. Add the necessary changes to the Design Sheet under the Decisions section, stating the date and description of the new filter feature for Pro users.
> 3. Update the Job Request List feature in the Specification, describing the filter functionality and its mechanics.
> 4. Implement the filter functionality in the application scope.
> 5. Ensure the job listing query filters results based on area and status, and orders them by the newest.
> 6. Test the feature thoroughly against acceptance criteria before deployment.

- A40.conflict: _
- A40.cited: _
- A40.outcome: _

---

### Case A41

**The owner asked:**
> For some retainer clients I charge one flat monthly number and they don't want to see a breakdown. Add a flat-fee invoice I can create with just an amount and a description.

**The engineer replied:**
> Got it! I will implement this feature for flat-fee invoices by extending the application's Payment Record functionality. Here's my plan:

**The engineer's plan:**
> 1. Update the Design Sheet to include 'Flat-Fee Invoice' under Things it keeps track of, with fields: Invoice ID (UUID), Amount (decimal), Description (text), Client, Date Created, Status (Paid/Unpaid).
> 2. Modify 'Client Profile' to include a new relationship with 'Flat-Fee Invoice', enabling linkage of invoices to individual clients.
> 3. Update the Specification document to include the changes made to the Design Sheet, providing details like lifecycle rules and permissions surrounding the creation, viewing, and updating of flat-fee invoices.
> 4. Implement a new feature in the application for receptionists to create, view, and manage flat-fee invoices.
> 5. Create backend endpoints for creating, updating, and retrieving flat-fee invoices, with necessary validation checks.
> 6. Update relevant front-end components or create new components to support the management of flat-fee invoices.
> 7. Test the new functionality with appropriate scenarios, such as creating a new invoice, associating it with a client, marking it as paid, and viewing its details.
> 8. Review and verify compliance with any specific constraints or rules found in the Design Sheet or Specification.

- A41.conflict: _
- A41.cited: _
- A41.outcome: _

---

### Case A42

**The owner asked:**
> Add a filter on the job request list so a pro can see only the open requests in their area, newest first.

**The engineer replied:**
> I need to flag a mismatch before doing anything: the project we're working on is an **invoicing app for small bookkeeping firms** — it has Bookkeepers, Clients, Firm Owners, Invoices, Payments, and Service Entries. There are no "job requests," "pros," or "areas" anywhere in the design sheet or spec.
> 
> It sounds like this request might be intended for a **different product** (perhaps a marketplace or field-services app). Could you clarify?
> 
> If you meant something within *this* invoicing app, here are the closest equivalents I can map your request to — let me know which fits:
> 
> 1. **"Open requests" → Invoices with status 'Draft' or 'Sent'** — A bookkeeper wants to filter the Invoice list to see only unpaid/unsent invoices, sorted newest first.
> 2. **"Their area" → Invoices assigned to them** — Filter to only invoices where `assignee_id` = the logged-in bookkeeper.
> 3. **"Pro" → Bookkeeper** — The logged-in staff member.
> 
> If that's the intent, here's what I'd do:
> 
> - Add a pre-set filter on the Invoice list: **Status = Draft or Sent**, **Assignee = current user**, sorted by `issue_date` descending.
> - Expose it as a one-click "My Open Invoices" filter chip on the Invoice list screen, alongside the existing filter/sort controls.
> - No data model changes needed — `status` and `assignee_id` already exist on Invoice.
> 
> Please confirm the intent (or let me know if this is for a different app) and I'll proceed.

**The engineer's plan:**
> 1. Identify that 'job requests', 'pros', and 'areas' do not exist in the design sheet or spec — flag the mismatch to the owner.
> 2. Ask the owner to clarify whether they meant a different product or a feature within the invoicing app.
> 3. Offer the closest plausible mapping within the existing data model (Invoice status filter + assignee filter + sort by issue_date desc) so the owner can confirm intent.
> 4. If confirmed, add a 'My Open Invoices' filter chip to the Invoice list screen (no data model changes required).
> 5. If the request is for a different product entirely, ask the owner to share the correct project context before proceeding.

- A42.conflict: _
- A42.cited: _
- A42.outcome: _

---

### Case A43

**The owner asked:**
> In the holiday rush Jamie can genuinely handle two people at once — one sits under the dryer while she starts the next colour. Let me put two clients into her same 2pm slot on busy Saturdays.

**The engineer replied:**
> I'll implement double-booking capability for Jamie with safety guards so she can’t accidentally get two haircuts at once.  
> 
> **Data model:** Add `max_concurrent_bookings` (default 1, set to 2 for Jamie) and `service_intensity` enum (active/passive) to the Services table. Bookings get a `slot_position` (A or B).  
> 
> **Screens:**  
> - **Calendar:** Split Jamie’s Saturday rows into two tracks—top for active work (cut, colour), bottom for passive processing (dryer, mask).  
> - **Booking form:** When picking Jamie on a busy Saturday, the UI offers “Chair 1” (any service) and “Chair 2” (passive only). If Chair 1 isn’t a colour with dryer time, Chair 2 stays hidden.  
> - **Conflict guard:** Hard block booking two “active” services in the same 30-min block; show “Jamie is already cutting hair then.”  
> 
> **Edge cases:**  
> - If the first client cancels, auto-notify the second so Jamie isn’t waiting idly.  
> - Prevent double-booking on non-Saturdays or for other stylists unless you toggle the flag.  
> - Ensure the dryer duration (45 min) is factored into Chair 2 availability—not just the slot start time.  
> 
> **Plan:**  
> 1. Migration for stylist capacity fields.  
> 2. Update availability API to return two slot objects for Jamie on Saturdays.  
> 3. Calendar split-view and booking validation rules.  
> 4. Test with colour + dryer vs. two colours (should reject latter).

**The engineer's plan:**
> 1. Add `max_concurrent_bookings` and `service_intensity` fields to data model
> 2. Update availability API to return 2 slot objects for Jamie on Saturdays
> 3. Implement split-track calendar UI for concurrent bookings
> 4. Add booking validation to prevent two 'active' services in same slot
> 5. Handle cancellation cascade and edge case logic

- A43.conflict: _
- A43.cited: _
- A43.outcome: _

---

### Case A44

**The owner asked:**
> Add a filter on the job request list so a pro can see only the open requests in their area, newest first.

**The engineer replied:**
> Got it! Here's exactly what I'll build:
> 
> **What's changing:**
> The job request list screen for pros will get a persistent filter that automatically narrows results to (1) open requests only and (2) within the pro's service area, sorted newest first. No extra clicks needed — it's the default view when they land on the list.
> 
> **Data model:**
> - `job_requests` table already likely has `status` and `zip_code`/`location`. I'll confirm we have a `created_at` timestamp (for sorting) and a `status` enum with an `open` value.
> - `pro_profiles` should have a `service_area` field (e.g., list of zip codes or a radius + lat/lng). I'll use whichever is already there.
> 
> **Backend changes:**
> - Update the job requests API endpoint (`GET /job-requests`) to accept optional query params: `status`, `area`, `sort`.
> - Default values: `status=open`, `area={pro's service area}`, `sort=created_at DESC`.
> - Filter logic: match `job_requests.zip_code` against the pro's stored service area zip codes (or PostGIS radius query if we're using geo coordinates).
> 
> **Frontend changes:**
> - On the job request list screen, call the endpoint with the defaults pre-applied on load.
> - Add a small filter bar at the top showing active filters as chips: **"Open"** and **"Your Area"** — each dismissible so pros can remove them if they want to browse wider.
> - Results display in newest-first order (no toggle needed unless you want one later).
> 
> **Edge cases I'll handle:**
> - Pro has no service area set → show a banner prompting them to complete their profile.
> - No open requests in their area → show an empty state with a friendly message instead of a blank screen.
> 

**The engineer's plan:**
> 1. Verify existing DB schema: confirm `job_requests` has `status` (enum with `open`), `created_at`, and a location field (zip code or lat/lng); confirm `pro_profiles` has a `service_area` field.
> 2. Update `GET /job-requests` API endpoint to support query params (`status`, `area`, `sort`) with defaults: `status=open`, area derived from the authenticated pro's service area, `sort=created_at DESC`.
> 3. Implement filter logic in the query: match job request location against pro's service area zip codes or use a PostGIS radius query if coordinates are stored.
> 4. Update the frontend job request list screen to call the endpoint with default filters pre-applied on mount.
> 5. Add a filter chip bar at the top of the list showing active filters ('Open', 'Your Area') that are individually dismissible.
> 6. Handle edge cases: (a) pro missing service area → show profile-completion banner; (b) zero results → show a meaningful empty state message.

- A44.conflict: _
- A44.cited: _
- A44.outcome: _

---

### Case A45

**The owner asked:**
> Good pros are willing to travel for a big job. When a request is worth over a thousand dollars, show it to strong pros anywhere and let them put in an application.

**The engineer replied:**
> I'll implement a high-value job marketplace feature. Here's the plan:

**The engineer's plan:**
> 1. **1. Data Model Updates**
> 2. • Add `estimated_budget` and `job_scope` enum (local_only | regional_open) to BookingRequest table.
> 3. • Create `JobApplication` table: id, booking_request_id, pro_id, proposed_price, travel_fee, message, status (pending | accepted | declined).
> 4. • Add `travel_radius_miles` and `interstate_travel_ok` boolean to Pro profiles.
> 5. 
> 6. **2. Booking Flow Changes**
> 7. • Request form gets 'Estimated Budget' field. If ≥$1,000, show toggle: 'Invite top-rated pros from surrounding areas.'
> 8. • High-value requests skip direct booking; status becomes 'Accepting Applications' for 24h.
> 9. • User dashboard shows applicant list with pro ratings, distance, and proposed pricing to select from.
> 10. 
> 11. **3. Pro Matching Logic**
> 12. • Define 'strong pro' as 4.5★+, 10+ completed jobs, background verified.
> 13. • System notifies strong pros within 100-mile radius; if <3 applications in 4h, expand to 250 miles.
> 14. • Cap applications at 5 per job to prevent spam.
> 15. 
> 16. **4. Edge Cases Handled**
> 17. • User can force 'local only' even on high-value jobs.
> 18. • If no applications in 24h, auto-cancel as before.
> 19. • Travel costs itemized separately in final quote before user confirmation.

- A45.conflict: _
- A45.cited: _
- A45.outcome: _

---

### Case A46

**The owner asked:**
> Add a filter on the invoice list so I can show only the ones that are past their due date and still unpaid.

**The engineer replied:**
> Understood. I'll implement past-due unpaid invoice filtering.

**The engineer's plan:**
> 1. Update the database query logic for filtering invoices to include criteria for 'past due' and 'unpaid' statuses.
> 2. Add a filter control for 'Past Due Unpaid' in the invoice list view.
> 3. Design test cases to ensure past due unpaid filtering works under scenarios such as multiple invoices, no matching invoices, and edge cases.
> 4. Update relevant documentation and user guides to reflect the change in functionality.

- A46.conflict: _
- A46.cited: _
- A46.outcome: _

---

### Case A47

**The owner asked:**
> The same retainer invoices go out to the same twelve clients every month and I re-key them every time. Set it up so they generate and send themselves on the 1st.

**The engineer replied:**
> Happy to build this — it's a real time-saver. Two things it touches that we don't have today: recurring schedules and email sending. Sending invoices via the app is currently listed as out of scope, so I want to flag that we'd be expanding scope there. Assuming you're on board, here's how I'd do it:
> 
> **Recurring templates:** Add a "recurring" flag to an invoice that stores the client, line items, amount, and a due-date rule (e.g. "due 15 days after generation"). You'd mark your twelve retainer clients once.
> 
> **Auto-generation:** A scheduled job runs on the 1st of each month, creates a fresh invoice from each template, and dates it correctly. Generated invoices appear in your normal list so you can still edit or delete any before/after they go.
> 
> **Auto-send:** After generation, the app emails each client their invoice (PDF with your branding). This needs an email service and a client email address on each record — I'll add that field.
> 
> **Edge cases I'll handle:** failed sends (retry + notify you), a client with no email (skip + flag), pausing a recurring client, and a safety window so nothing sends if a template is incomplete.
> 
> **Recommended:** a quick "sending on the 1st" summary email to you, and the option to review-before-send rather than fully automatic — some firms prefer a human glance. Want it fully hands-off, or a one-click approval each month?
> 
> I'll also update the docs to bring recurring + email into scope.

**The engineer's plan:**
> 1. Flag scope change: email sending and recurring invoices are currently out of scope; confirm with owner and update requirements/scope docs.
> 2. Add client email address field to the invoice/client data model.
> 3. Add a recurring invoice template model: client, line items, amount, due-date rule, active/paused flag, next-run date.
> 4. Let staff mark an invoice/client as recurring and configure the due-date rule.
> 5. Build a scheduled job that runs on the 1st of each month to generate invoices from active templates.
> 6. Generated invoices appear in the standard invoice list for review/edit/delete.
> 7. Integrate an email service to send branded PDF invoices to each client automatically after generation.
> 8. Handle edge cases: missing client email (skip + flag), send failures (retry + notify), paused clients, incomplete templates (do not send).
> 9. Add a monthly summary/notification email to the firm; optionally support a review-before-send approval flow.
> 10. Write automated tests for recurring generation, scheduling, and email sending; add manual walkthrough steps for the monthly run.
> 11. Update project documentation (scope, plan, validation) to reflect recurring invoices and email sending.

- A47.conflict: _
- A47.cited: _
- A47.outcome: _

---

### Case A48

**The owner asked:**
> When a client pays by bank transfer I need to enter it — the date it landed, the amount, and which invoice it was for.

**The engineer replied:**
> Quick heads-up before I build this: recording payments is currently listed as *out of scope* ("Handling of payments via the app"). What you're describing is lighter than full payment processing — it's manual payment tracking, not taking card payments — so I think it's a sensible addition. I'll treat this as a deliberate scope change and update the docs to match.
> 
> Here's what I'll do:
> 
> 1. **Data model** — add a `Payment` record linked to an invoice: payment date (the date it landed), amount, and the invoice it applies to. I'll allow multiple payments per invoice so partial payments and installments work.
> 
> 2. **Invoice status** — derive a status from payments vs. total: Unpaid / Partially Paid / Paid. Show an outstanding balance on each invoice.
> 
> 3. **Screens** — a "Record Payment" action on an invoice, plus a list of payments on the invoice detail view, with edit/delete for corrections.
> 
> 4. **Edge cases** — reject zero/negative amounts; warn (but allow) if a payment exceeds the outstanding balance in case of overpayment; keep everything English and matching firm branding.
> 
> 5. **Access** — same rule as invoices: any authenticated firm staff can record/edit/delete payments.
> 
> 6. **Tests & docs** — add CRUD and status-calculation tests, and update the requirements/validation docs.
> 
> One question so I build it right: do you ever need to record **partial payments** against one invoice, or is it always paid in full in a single transfer? I've assumed partials are allowed — tell me if you'd rather keep it one-payment-per-invoice.

**The engineer's plan:**
> 1. Update project docs: move manual payment tracking from 'Not in Scope' into scope as a deliberate change, distinct from full payment processing
> 2. Add a Payment data model linked to Invoice, capturing payment date, amount, and invoice reference; support multiple payments per invoice for partial/installment cases
> 3. Derive invoice status (Unpaid / Partially Paid / Paid) and outstanding balance from payments against the invoice total
> 4. Build 'Record Payment' UI on the invoice, plus a payments list on invoice detail with edit/delete for corrections
> 5. Handle edge cases: reject zero/negative amounts, warn on overpayment beyond outstanding balance, keep output English and on-brand
> 6. Apply same access control as invoices: authenticated firm staff only
> 7. Add automated tests for payment CRUD and status calculation; run manual walkthrough
> 8. Confirm with owner whether partial payments are needed (assumed yes)

- A48.conflict: _
- A48.cited: _
- A48.outcome: _

---

### Case A49

**The owner asked:**
> Let clients pay for the appointment when they book it online, so we stop chasing money at the desk afterwards.

**The engineer replied:**
> I'll add online payment capture at booking. This shifts us from 'record keeping' to 'payment processing', so we need a few concrete changes:
> 
> **Data model updates**
> - Expand Payment Record with: stripe/payment gateway ID, card fingerprint (last-4), captured-at timestamp, and refund status.
> - Add a Pending Booking hold table: when a client picks a slot, we lock it for 10 minutes while they pay; if payment fails, the slot releases automatically.
> - Service table needs a 'deposit required' flag (optional upfront percentage vs. full price).
> 
> **Booking flow changes**
> - The guest checkout screen gets a payment step before confirmation. We validate the card, then confirm the appointment only on successful charge.
> - If the card is declined, we show the error and keep the slot held for one retry, then release it.
> 
> **New screens & permissions**
> - Receptionist dashboard gets a 'Refund' button tied to the original transaction (for cancellations within policy) and a 'No-show / Keep Deposit' toggle.
> - Client profile adds 'Payment method on file' for express rebooking, but we never store raw card numbers (token only).
> 
> **Edge cases to handle**
> - Duplicate charges: idempotency keys so refreshing the page doesn't double-bill.
> - Cancellations: auto-refund if within the 24-hour window, manual review if after.
> - Chargebacks: log IP address and booking confirmation timestamp as evidence.
> - No-shows: policy decision needed—do we keep the full payment, partial, or refund? I'll default to 'keep as no-show fee' but make it configurable per service.
> 
> First, I'll integrate Stripe (or your preferred gateway) and update the booking confirmation logic, then add the refund UI for your receptionists. Sound right?

**The engineer's plan:**
> 1. Integrate Stripe SDK & webhook handlers
> 2. Modify booking flow: hold slot → payment intent → confirm on success
> 3. Update Payment Record schema with gateway IDs and refund tracking
> 4. Add refund/no-show controls to receptionist dashboard
> 5. Configure deposit vs. full-payment rules per Service

- A49.conflict: _
- A49.cited: _
- A49.outcome: _

---

### Case A50

**The owner asked:**
> Add a filter on the invoice list so I can show only the ones that are past their due date and still unpaid.

**The engineer replied:**
> Good news — this is a small, contained change since we already have a sortable/filterable invoice list. Here's what I'll do:
> 
> I'll add an **"Overdue"** filter option to the invoice list. When you turn it on, it shows only invoices where the Due date is before today AND the Status is not "Paid" (so Draft and Sent invoices past due both show up).
> 
> Steps:
> 1. Add a filter control on the invoice list — I'll make it a quick toggle/preset called "Overdue only," alongside the existing status filters, so it's one click.
> 2. Wire the logic: Due date < today AND Status ≠ Paid.
> 3. Handle edge cases: invoices due exactly today are treated as not yet overdue (still on time); Draft invoices with no Due date set are excluded; the filter combines cleanly with your existing sort (e.g. sort by Due date to see the most overdue first).
> 4. Make it work on desktop and phone, and keep it applied when you export the list to CSV so a "download overdue" gives you just those rows.
> 
> One quick question so I match your expectation: should Draft invoices that happen to be past due count as "overdue," or only ones you've actually Sent? My default is to include both, but many firms only care about Sent ones. I'll go with **Sent + past due unpaid** unless you tell me otherwise.
> 
> No impact on invoice numbering, payments, or any of your business rules — purely a viewing filter.

**The engineer's plan:**
> 1. Add an 'Overdue only' filter preset/toggle to the invoice list UI, alongside existing status filters, available on desktop and mobile.
> 2. Implement filter logic: Due date < today (current date) AND Status != 'Paid'; treat due-today as not overdue.
> 3. Exclude invoices with no Due date set from the overdue results.
> 4. Confirm default scope with owner: include both Draft and Sent past-due unpaid, defaulting to Sent + unpaid + past-due.
> 5. Ensure the filter combines with existing sort (e.g. by Due date) and carries through to CSV/Excel export.

- A50.conflict: _
- A50.cited: _
- A50.outcome: _
