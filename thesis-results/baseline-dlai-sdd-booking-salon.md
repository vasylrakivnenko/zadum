# requirements.md

## Scope
- Users can book appointments for haircuts and color treatments only.
- Users (customers) can modify and cancel their own bookings.
- Staff/admins can manage (view, modify, cancel) all bookings.
- User authentication and role identification for customers and staff.

**Out-of-scope:**
- Bookings for other services (e.g., nails, spa, etc.)
- Integrated payments or invoicing
- Marketing or promotional messaging

## Decisions
- Limiting services to haircuts and color treatments keeps the workflow simple and focused on main offerings.
- Both staff/admins and customers can manage bookings: staff for operational flexibility, customers for self-service convenience.
- User roles are required for differentiating booking management abilities.

## Context
- App copy and prompts must be casual and friendly to create a warm, salon-like experience.
- Consider accessibility for all user types, keep flows intuitive.


# plan.md

1. **Setup & Authentication**
   1. Set up basic project structure and repository.
   2. Implement user authentication (email/password, optional social login).
   3. Create user roles: customer and staff/admin.

2. **Service Catalog**
   1. Define service types: haircut, color treatment.
   2. Expose these options in booking UI.

3. **Appointment Booking Flow**
   1. Build booking page where users select date, time, service type.
   2. Validate availability (no double bookings for staff/resources).
   3. Confirm and save appointments.

4. **Booking Management**
   1. Allow customers to view, modify, cancel their own appointments.
   2. Allow staff/admins to view all appointments, and modify or cancel any booking.
   3. Send notifications (e.g., email or in-app) about changes.

5. **User Interface & Experience**
   1. Apply casual, friendly copy throughout UI.
   2. Test flows for both user roles.
   3. Add clear feedback for key actions (success, error, loading).

6. **Test & Launch**
   1. Write end-to-end automated and manual tests for booking flows.
   2. Validate user role switching and permissions.
   3. Review tone/content for appropriate casualness and friendliness.
   4. Prepare documentation and deploy initial version.


# validation.md

## Automated Checks
1. Users can register and login, are assigned proper roles.
2. Booking an appointment for haircut or color treatment creates a record in the system.
3. Appointment slots are not double-booked (per resource/staff).
4. Customers can view and edit/cancel their own bookings only.
5. Staff/admins can view, edit, and cancel all bookings.
6. Unauthenticated users cannot access booking management features.
7. Notifications (where implemented) are sent on changes.

## Manual Walkthrough
1. Register as a customer, book a haircut at an available time, verify booking appears.
2. Attempt to book the same time as another appointment, verify the app prevents double-booking.
3. Edit and then cancel the booking as a customer, verify changes are saved and visible.
4. Register/login as staff; view all bookings; edit/cancel a customer booking; confirm changes are reflected.
5. Attempt unauthorized actions (e.g., customer tries to edit someone else's appointment) – confirm access is denied.
6. Try various flows and check all UI messages use casual, friendly tone.
7. Repeat tests for color treatment service.

## Tone Check
- All user-facing text is warm, encouraging, and avoids formal or technical jargon.
- Examples: “Ready for a new look?”, “We’ve booked your spot!”, “Uh-oh, that time is taken. Try another?”

## Definition of Done
- All listed automated checks pass.
- Manual walkthrough yields expected results with no blockers.
- All flows use the correct tone.
- App is ready for use by both customers and staff/admins for haircut and color treatment bookings.