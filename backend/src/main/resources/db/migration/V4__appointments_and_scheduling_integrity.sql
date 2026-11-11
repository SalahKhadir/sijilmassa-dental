-- One clinic / one scheduling resource. No btree_gist extension is needed for a single range.
CREATE TABLE appointment (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    appointment_type varchar(24) NOT NULL CHECK (appointment_type IN (
        'CONSULTATION','CONTROLE','DETARTRAGE','SOIN_DENTAIRE','EXTRACTION','AUTRE')),
    status varchar(16) NOT NULL CHECK (status IN ('EN_ATTENTE','CONFIRME','TERMINE','ANNULE','ABSENT')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    CONSTRAINT appointment_duration CHECK (end_at - start_at BETWEEN INTERVAL '30 minutes' AND INTERVAL '180 minutes'),
    CONSTRAINT appointment_minutes CHECK (extract(second FROM start_at) = 0 AND extract(second FROM end_at) = 0),
    CONSTRAINT appointment_year CHECK (start_at >= TIMESTAMPTZ '0001-01-01 00:00:00+00' AND end_at < TIMESTAMPTZ '10000-01-01 00:00:00+00'),
    CONSTRAINT appointment_no_overlap EXCLUDE USING gist (tstzrange(start_at,end_at,'[)') WITH &&)
        WHERE (status IN ('EN_ATTENTE','CONFIRME','TERMINE'))
);
-- Also serves range queries that include cancelled/absent appointments.
CREATE INDEX appointment_calendar_range_idx ON appointment USING gist (tstzrange(start_at,end_at,'[)'));
CREATE INDEX appointment_patient_start_idx ON appointment (patient_id,start_at,id);
CREATE INDEX appointment_start_idx ON appointment (start_at,id);

ALTER TABLE security_audit_event ADD COLUMN target_appointment_id uuid REFERENCES appointment(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_appointment_target CHECK (
    (event_type IN ('APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED')
        AND target_appointment_id IS NOT NULL AND actor_user_id IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL)
    OR (event_type NOT IN ('APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED')
        AND target_appointment_id IS NULL)
);
CREATE INDEX security_audit_appointment_time_idx ON security_audit_event (target_appointment_id,occurred_at);
