# Cancellation Reason Requirement Design

## Overview

Add a dropdown setting in Event Type Advanced settings that allows hosts to configure when cancellation reasons are required from hosts and/or attendees.

## Problem Statement

Currently, cancellation reasons are always optional. Hosts need the ability to require reasons for better tracking and accountability.

## User Stories

- As a host, I want to require cancellation reasons from attendees so that I understand why bookings are cancelled
- As a host, I want to require my team to provide cancellation reasons so that we have records of why bookings were cancelled
- As a host, I want to make cancellation reasons optional when they're not needed

## Technical Design

### Database Changes

Add new enum `CancellationReasonRequirement` with values:
- `MANDATORY_BOTH`
- `MANDATORY_HOST_ONLY`
- `MANDATORY_ATTENDEE_ONLY`
- `OPTIONAL_BOTH`

Add column `requiresCancellationReason` to EventType model with default `MANDATORY_HOST_ONLY`.

Location: `packages/prisma/schema.prisma` (near `disableCancelling`/`disableRescheduling`)

### API Changes

Update `packages/features/bookings/lib/handleCancelBooking.ts` to validate cancellation reason based on:
- Event type's `requiresCancellationReason` setting
- Who is cancelling (host vs attendee)

### UI Changes

**Event Type Settings**

Location: `apps/web/modules/event-types/components/tabs/advanced/EventAdvancedTab.tsx`

Add dropdown after Booking Questions section, before RequiresConfirmationController:
- Label: "Require cancellation reason"
- Description: "Ask for a reason when someone cancels a booking"
- Options: Mandatory for both, Mandatory for host only (default), Mandatory for attendee only, Optional for both

**Cancel Booking**

Location: `apps/web/components/booking/CancelBooking.tsx`

- Add `requiresCancellationReason` prop
- Replace hardcoded `hostMissingCancellationReason` logic with configurable validation based on the setting
- Show required indicator on textarea when reason is required

## Data Flow

1. EventType stores `requiresCancellationReason` in database
2. `getEventTypesFromDB` (`apps/web/lib/booking.ts`) includes the field in select
3. Value flows through page props to booking views
4. `CancelBooking` component uses it for validation

Files requiring prop threading:
- `apps/web/lib/booking.ts`
- `apps/web/modules/bookings/views/bookings-single-view.tsx`
- `apps/web/components/dialog/CancelBookingDialog.tsx`

## Edge Cases

- Platform users: Should respect the setting
- Team bookings: Setting applies regardless of team context
- Null column value: Default to `MANDATORY_HOST_ONLY` behavior
- Default event types (no eventTypeId): Use default `MANDATORY_HOST_ONLY`

## Out of Scope

- Reschedule reason configuration (separate feature)
- Custom reason dropdown options
- Reason analytics/reporting

# Cancellation Reason Requirement Decisions

## ADR-001: Store in Database Column vs Metadata JSON

### Context

Need to store the cancellation reason requirement setting on EventType.

### Options Considered

1. **New database column with enum** — Requires migration, type-safe, cleaner queries
2. **Metadata JSON field** — No migration, but less type-safe for a core setting

### Decision

Use a dedicated database column with a Prisma enum (`CancellationReasonRequirement`).

Rationale:
- This is a core booking flow setting, similar to `disableCancelling` and `requiresConfirmation`
- Type-safe at the database level
- Cleaner to query in cancellation validation logic
- Consistent with how similar settings (`disableCancelling`, `disableRescheduling`) are stored

### Consequences

- Requires database migration
- Type-safe enum values
- Direct column access in queries (no JSON parsing)

# Cancellation Reason Requirement Implementation

## Status: complete

## Completed

1. Added CancellationReasonRequirement enum to schema.prisma (line 129)
2. Added requiresCancellationReason column to EventType model (line 269)
3. Created database migration (20260115111819_add_cancellation_reason_require)
4. Added translation keys to English locale (common.json)
5. Added dropdown setting in EventAdvancedTab (lines 691-719)
6. Added requiresCancellationReason to getEventTypesFromDB select (apps/web/lib/booking.ts)
7. Passed requiresCancellationReason prop through:
   - bookings-single-view.tsx → CancelBooking
   - CancelBookingDialog.tsx → CancelBooking
8. Updated CancelBooking component Props and validation logic
9. Added server-side validation in handleCancelBooking
10. Added requiresCancellationReason to getBookingToDelete select
11. Fixed dynamic label to show "(optional)" only when isReasonRequiredForUser() returns false

## In Progress

## Blocked

## Next Steps

- Test the feature end-to-end
- Verify all dropdown options work correctly
- Verify dynamic label shows "(optional)" only when appropriate

## Session Notes

- Enum and column were already added to schema during planning phase
- Migration was already created

# Cancellation Reason Requirement Future Work

Ideas and enhancements deferred from initial implementation.

## Enhancements

- Reschedule reason requirement (same pattern, separate setting)
- Custom predefined reason options (dropdown instead of free text)
- Reason analytics dashboard

## Technical Debt

## Nice to Have

- Per-user reason requirement overrides
- Reason templates

# Cancellation Reason Requirement Documentation

## Overview

This feature allows event type owners to configure when cancellation reasons are required.

## Screenshots

Screenshots will be added here once the feature is implemented.

## Configuration

The setting is located in Event Type → Advanced Settings, after the Booking Questions section.

### Options

- **Mandatory for both**: Both host and attendee must provide a reason when cancelling
- **Mandatory for host only** (default): Only the host must provide a reason
- **Mandatory for attendee only**: Only the attendee must provide a reason
- **Optional for both**: Cancellation reason is optional for everyone