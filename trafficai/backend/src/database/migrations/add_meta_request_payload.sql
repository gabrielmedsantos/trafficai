-- Migration: Add meta_request_payload column to tracking_events
-- This column stores the exact JSON payload sent to Meta CAPI at the time of the event
-- Used for audit purposes to show what was actually sent, not reconstructed data

ALTER TABLE tracking_events
ADD COLUMN IF NOT EXISTS meta_request_payload JSONB;

-- Add index for faster queries if needed
CREATE INDEX IF NOT EXISTS idx_tracking_events_meta_request_payload
ON tracking_events USING GIN (meta_request_payload);

-- Comment for documentation
COMMENT ON COLUMN tracking_events.meta_request_payload IS
'Immutable snapshot of the exact JSON payload sent to Meta CAPI at event creation time. Used for audit trail.';