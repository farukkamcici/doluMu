CREATE TABLE IF NOT EXISTS bus_schedules (
    id SERIAL PRIMARY KEY,
    line_code VARCHAR(32) NOT NULL,
    valid_for DATE NOT NULL,
    day_type CHAR(1) NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT,
    CONSTRAINT uq_bus_line_valid_day_type UNIQUE (line_code, valid_for, day_type)
);

CREATE INDEX IF NOT EXISTS idx_bus_schedules_line_code
    ON bus_schedules (line_code);

CREATE INDEX IF NOT EXISTS idx_bus_schedules_valid_for
    ON bus_schedules (valid_for);

CREATE INDEX IF NOT EXISTS idx_bus_schedules_day_type
    ON bus_schedules (day_type);
