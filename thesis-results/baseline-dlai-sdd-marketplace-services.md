# Requirements: Marketplace for Booking Local Home-Repair Pros

## Scope
- **Included:**
  - Listing of local home-repair pros
  - Customer reviews and ratings for each pro
  - Booking requests sent from customers to pros
  - Pros manually accept or reject booking requests
  - Listings content presented in a professional and concise tone
- **Excluded:**
  - Automatic booking or instant confirmation
  - Escrow or payment processing
  - Messaging/chat between customer and pro within platform
  - Home-repair job management (e.g., completion tracking, invoicing)

## Decisions
- The marketplace will prioritize displaying customer reviews and ratings prominently on each home-repair pro's profile, to inform booking decisions.
- Booking requests from customers will be routed to pros, who must manually review and accept/reject them, to allow pros full control over their schedule and workload.
- Listings and all user-facing content will be reviewed for professionalism and conciseness, maintaining brand trust and clarity.

## Context
- Listings must use professional language (no slang, exaggeration, or informal phrasing).
- Copy throughout the app (listing, reviews, booking confirmation) should be concise, avoiding rambling or unnecessary detail.
- Marketplace is web-based.

# Plan

1. Pro Listing and Review Display
    1. Create schema/model for home-repair pros
    2. Implement listing page with search/filter for local pros
    3. Add profile pages for each pro with full details
    4. Display customer reviews and ratings prominently
    5. Implement review submission flow (after completed job)

2. Booking Request Flow
    1. Build booking form for customer to request service from a pro
    2. Implement backend logic to route booking request to selected pro
    3. Develop pro dashboard to view, accept, or reject booking requests
    4. Send notifications of booking status (accepted/rejected) to customer

3. Listing Content and Tone Enforcement
    1. Draft guidelines/checklist for listing content (professional, concise)
    2. Integrate copy review and moderation tools (manual or automated)
    3. Validate listing, review, and booking confirmation content with tone guidelines

4. Testing and Validation
    1. Write automated tests for booking logic and ratings display
    2. Manual walkthrough for listing, booking, and review flows
    3. Tone check on all user-facing copy

# Validation

## Automated Checks
- Customer reviews and ratings are visible on each pro's profile
- Booking request can be submitted and is delivered to the pro
- Booking can only be confirmed after manual acceptance by pro
- Pros cannot confirm booking automatically
- Notifications are sent to customers on acceptance/rejection

## Manual Walkthrough
1. Customer searches for local home-repair pros
2. Customer selects a pro and views profile (reviews and ratings clearly displayed)
3. Customer submits a booking request
4. Pro receives request, reviews and manually accepts/rejects
5. Customer receives status notification
6. (Edge Case) Booking request is ignored or declined: customer receives rejection/timeout notification
7. Reviews can only be submitted post-service; no duplicate reviews from same customer for same job

## Tone Check
- All listings and confirmations reviewed for professional and concise tone: check for extraneous language, informal speech, or excessive detail

## Definition of Done
- All automated and manual checks pass
- All user-facing content aligns with tone guidelines
- No feature or behaviour outside stated scope (e.g., no instant booking, payment, chat)