# Spec: Home-Repair Pro Marketplace

## Feature Overview
A platform enabling users to find, compare, and book local home-repair professionals through a digital marketplace. The app connects homeowners seeking repair services with qualified local experts.

## User Scenarios & Testing
1. **As a homeowner**, I search for local pros for a specific home-repair job (e.g., plumbing).
2. I view a list of available pros, read ratings/reviews, compare prices, and view profiles.
3. I request a booking with a selected pro, providing details of the repair job, preferred date/time, and contact info. (**Clarified:** User must provide full address, contact info, job details, photos, and preferred date/time when making a booking request.)
4. The marketplace notifies the pro of the booking request, who can confirm or suggest alternatives.
5. Upon confirmation, both user and pro receive confirmation details.
6. After service completion, the user can rate/review the pro.
7. **As a home-repair pro**, I can register, list my services, set my availability, respond to booking requests, and manage my schedule.
8. Homeowners and pros can communicate directly via in-platform messaging for additional job details and coordination.

## Functional Requirements
1. Users must be able to search for local home-repair pros based on job category and location.
2. Profiles for each pro display service offerings, prices, ratings, reviews, and availability.
3. Users can request bookings by submitting job details and preferred times.
   - **Clarified:** Booking request requires user to submit full address, contact info, job details, photos, and preferred date/time.
4. Pros must receive booking requests and can accept, decline, or propose alternatives.
5. Upon mutual confirmation, both parties receive confirmation.
6. Users can leave ratings and written reviews for completed jobs.
7. Pros can manage their listings, availability, and respond to incoming requests in real-time.
8. The platform must notify users/pros of booking updates and changes.
9. The marketplace collects and processes payments online between users and pros. (Resolved: see clarifications)
10. Both homeowners and pros authenticate using marketplace-managed email/password signup with email verification. (See Clarifications)
11. The platform provides in-platform messaging for communication between users and pros throughout the booking process, including discussing job details and coordination.
12. Every pro must pass a deep background check (third-party verification, criminal and civil screen) before appearing in search results. (See Clarifications)
13. If a pro does not respond to a booking request within 24 hours, the request expires and is auto-cancelled, with a notification sent to the user. (See Clarifications)

## Success Criteria
- Users can search and view at least 20 local pros for a trade within 10 seconds.
- At least 90% of booking requests receive a response from pros within 24 hours.
- 95% of completed bookings are reviewed/rated by users.
- Users report above 85% satisfaction with the booking experience in survey.
- User and pro notifications on booking status changes are delivered within 1 minute.
- Booking requests that do not receive a response within 24 hours are automatically expired/cancelled, and the requesting user is notified.

## Key Entities
- **User (Homeowner):** Can search, book, rate, and review pros.
- **Pro (Home-Repair Professional):** Can register, manage listings, respond to bookings, and set availability. Pro's profile will only be visible after passing third-party background screening verification.
- **Booking:** Contains job details, status (including expired/cancelled by timeout), participants, schedule, and communications.
   - **Clarified:** Booking requests require user full address, contact info, job details, photos, and preferred date/time as minimal required fields.
- **Service/Job Category:** Types of repair offered (plumbing, electrical, etc.).
- **Review:** Linked to a completed booking between user and pro.
- **Payment:** Tracks transaction between user and pro, with processing status and references.
- **Message/Conversation:** Stores in-platform communication between users and pros, associated with a booking or user/pro profile as appropriate.

## Assumptions
- Both web and mobile interfaces may be provided (device type unspecified).
- Each booking is for a single job and pro only (no multi-pro bookings per job).
- Pros are responsible for keeping their availability up-to-date in the system.
- Communication between users and pros is conducted via the platform for privacy and record-keeping.
- Payment processing includes fee deductions handled by the marketplace (industry standard rate assumed unless specified).
- All pros visible to users have passed a deep 3rd-party background and identity check.
- Unanswered booking requests will not remain pending indefinitely; auto-cancellation provides a timely user experience.

## Out of Scope
- Vetting or background checks of pros (unless specified otherwise). (Superceded: see Clarifications)
- Dispute resolution between users and pros post-service.
- Insurance or liability coverage for jobs booked through the platform.

## Clarifications
### Session 2024-06-16
- Q: How is user authentication and identity verification handled for both homeowners and pros? → A: Marketplace-managed: email/password signup for both, with email verification
- Q: Will users and pros be able to communicate (e.g., message each other or exchange additional job details) directly within the platform, or is all interaction limited to booking requests and status notifications? → A: In-platform messaging between users and pros allowed
### Session 2024-06-17
- Q: What level of vetting is performed for pros before they appear in search results (none, basic license check, deep background check, customer-submitted validation, or other)? → A: Deep background check (3rd party verification, criminal/civil screen)
### Session 2024-06-18
- Q: What happens if a pro does not respond to a booking request within 24 hours—should the request expire, get auto-cancelled, remain pending, or trigger other actions? → A: Request expires and is auto-cancelled after 24h with notification to the user.
### Session 2024-06-19
- Q: What information must a user provide upfront before sending a booking request to a pro (minimal required fields)? → A: Full address, contact info, job details, photos, preferred date/time
