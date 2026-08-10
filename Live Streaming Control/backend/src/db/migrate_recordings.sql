-- Migrate: Live streaming recordings
-- Tracks all recordings (costream and standard broadcasts)

CREATE TABLE IF NOT EXISTS live_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id UUID NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  recording_type VARCHAR(50) NOT NULL,  -- 'costream' | 'standard' | 'hybrid'
  status VARCHAR(50) NOT NULL DEFAULT 'recording',  -- recording | completed | failed | archived
  format VARCHAR(20) NOT NULL DEFAULT 'mp4',  -- mp4 | hls | mkv
  file_path VARCHAR(2048),  -- /recordings/live-{liveId}-{timestamp}.mp4
  file_size_bytes BIGINT,  -- Bytes after completion
  duration_seconds INT,  -- Total duration
  hls_manifest_url VARCHAR(1000),  -- http://host:8000/recordings/{id}/index.m3u8 (if HLS backup)
  video_bitrate VARCHAR(20),  -- '3000k'
  audio_bitrate VARCHAR(20),  -- '128k'
  resolution VARCHAR(20),  -- '1920x1080'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,  -- { "traders": ["A", "B"], "layout": "split-50-50", "source_url": "..." }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_recordings_live_id ON live_recordings(live_id);
CREATE INDEX IF NOT EXISTS idx_live_recordings_status ON live_recordings(status);
CREATE INDEX IF NOT EXISTS idx_live_recordings_created ON live_recordings(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_recordings_live_primary
  ON live_recordings(live_id, format) WHERE status IN ('recording', 'completed');
