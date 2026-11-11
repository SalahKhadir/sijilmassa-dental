ALTER TABLE clinical_treatment ADD COLUMN removed_at timestamptz;
ALTER TABLE clinical_treatment ADD CONSTRAINT clinical_treatment_removal_time
    CHECK (removed_at IS NULL OR (removed_at >= created_at AND removed_at <= updated_at));
CREATE INDEX clinical_treatment_active_chronology_idx
    ON clinical_treatment (consultation_id, treatment_date, id) WHERE removed_at IS NULL;

ALTER TABLE security_audit_event ADD COLUMN target_consultation_id uuid
    REFERENCES clinical_consultation(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
    'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_consultation_target CHECK (
    (event_type IN ('CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED')
        AND target_consultation_id IS NOT NULL AND actor_user_id IS NOT NULL
        AND subject_user_id IS NULL AND target_patient_id IS NULL AND target_appointment_id IS NULL)
    OR (event_type NOT IN ('CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED')
        AND target_consultation_id IS NULL)
);
CREATE INDEX security_audit_consultation_time_idx ON security_audit_event (target_consultation_id, occurred_at);
