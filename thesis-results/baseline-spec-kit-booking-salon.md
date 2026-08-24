# Feature Specification: Hair Salon Booking App

## Overview
A booking app to manage appointments for a hair salon. The app enables customers to view available time slots, book services, and receive confirmation, while staff can manage their schedule and review bookings.

## Goals
- Allow customers to book hair salon appointments online
- Simplify schedule management for staff
- Reduce missed appointments through user reminders

## Actors
- Customer
- Salon Staff
- Administrator (can manage settings and staff)

## User Scenarios & Testing
1. **Customer searches for available time slots:**
   - User opens the booking app
   - Selects service type (e.g., haircut, coloring, styling)
   - Views the calendar to see available slots
   - Selects a preferred date and time
   - Enters contact information
   - Confirms booking
   - Receives booking confirmation and a reminder before the appointment
   - **Clarification:** Customers do not need to create an account or log in; bookings are made as guests by entering contact information only.
   - **Clarification:** Required contact information fields for booking are name, email, and phone number. Both email and phone are required for completion.
   - **Clarification:** If a customer tries to book an already occupied (double-booked) appointment slot, the system will block the booking attempt and show an error message to the customer. No queueing or staff override is allowed for double-booking attempts.
   - **Clarification:** If an appointment is canceled, the time slot automatically becomes available for new bookings without manual staff approval or intervention.

2. **Staff reviews and manages appointments:**
   - Staff logs into the staff dashboard
   - Views upcoming appointments
   - Marks appointments as completed, canceled, or no-show
   - Updates availability as needed

3. **Administrator manages services and schedule:**
   - Admin updates available services/pricing
   - Adjusts staff working hours and salon closure dates

## Functional Requirements
1. Customers can view available appointment slots for different services.
2. Customers can select a service, date, and time, and book an appointment by providing required contact details.
   - **Clarification:** Customers make bookings as guests by entering their contact info; accounts or social logins are not required.
   - **Clarification:** When booking an appointment, customers must provide name, email, and phone number. Both email and phone number are mandatory fields.
3. System sends a confirmation notification to the customer upon successful booking.
4. System sends appointment reminders to customers ahead of their scheduled time.  
   - **Clarification:** Appointment reminders must be sent to customers at both 24 hours and 2 hours before the scheduled appointment time.
5. Staff can access a dashboard to view, update, or cancel appointments.
6. Staff/admin can modify service offerings, durations, and prices.
7. Only available slots (not double-booked, not outside working hours) are shown for booking.
8. System prevents double-booking of the same slot.
   - **Clarification:** If a customer attempts to book a slot that is already taken, the system must block the booking and display a clear error message to the customer indicating the time slot is unavailable. There should be no option to override or queue such requests.
9. Booking, canceling, and editing appointments are tracked in a booking history log.
10. Admin access is required for modifying global settings (e.g., service catalog, working hours).
11. If an appointment is canceled by staff or customer, the associated time slot must automatically become available for booking immediately, without requiring manual staff approval or release.

## Success Criteria
- 95% of appointments are successfully booked without double-booking errors
- Customers receive confirmation and reminder notifications for all bookings
- Staff dashboard accurately reflects scheduled appointments
- Over 90% of appointment slots booked by customers without staff intervention
- Reduction in no-shows by at least 25% due to reminder notifications

## Key Entities
- **User (Customer, Staff, Admin):** name, contact info (must include both email and phone for customers), role
- **Service:** type, duration, price
- **Appointment:** date, time, service, assigned staff, status
- **Notification:** type (confirmation, reminder), recipient, content

## Constraints
- Only operating hours can be booked
- User contact info is required for booking and notification delivery
   - **Clarification:** Customer booking requires both email and phone number in addition to name.
- No limit: customers can book any future date
- **Clarification:** No user registration or authentication is required for customers to book; guest bookings only.
- **Clarification:** Double-booking is not permitted under any circumstances; if a booking attempt conflicts with an existing appointment, the system will reject the request and show an error message to the user.
- **Clarification:** Appointment slots that are canceled are returned to the available pool for immediate booking by other customers.

## Out of Scope
- Payment processing
- Loyalty/reward programs
- Staff payroll and management outside booking use case

## Assumptions
- Users have internet-enabled devices
- Time zone is based on salon's physical location
- Reminder notifications sent via both SMS and email

## Clarifications
### Session 2024-06-19
- Q: **Question:** How far in advance should appointment reminder notifications be sent to customers (e.g., hours or days before the appointment)? → A: Both 24 hours and 2 hours before
### Session 2024-06-20
- Q: **Question:** What method should customers use to authenticate or identify themselves when booking an appointment (e.g., guest info form, account sign-up, social login)? → A: Guest booking without account (just contact info)
### Session 2024-06-21
- Q: **Question:** What are the required fields for customer contact information when booking an appointment? → A: Name, email, and phone number (both required)
### Session 2024-06-22
- Q: **Question:** What should happen if a customer tries to book an overlapping appointment slot (i.e., double-booking) – should the system block it completely, allow staff override, or queue it as a request? → A: Block double-booking completely (show error to customer)
### Session 2024-06-23
- Q: **Question:** In the event of canceled appointments, should canceled time slots immediately become available for new bookings, or is a manual staff approval/release required before making them available? → A: Automatically reopen slot for booking

## Appendix
- Sample booking confirmation message: "Your appointment for [service] on [date/time] is confirmed. For changes, contact us at [contact info]."
- Sample reminder message: "Reminder: You have an appointment at [salon name] on [date/time]."