-- Draft foundation only: no PDF payload, document snapshot, or finalization capability.
ALTER TABLE clinical_consultation ADD CONSTRAINT clinical_consultation_id_patient_unique UNIQUE (id, patient_id);
CREATE TABLE prescription (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    consultation_id uuid,
    version bigint NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
    status varchar(16) NOT NULL DEFAULT 'BROUILLON',
    issued_date date NOT NULL CHECK (issued_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    general_instructions varchar(2000) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    created_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    archived_at timestamptz,
    archived_by uuid REFERENCES application_user(id) ON DELETE RESTRICT,
    corrects_prescription_id uuid,
    CONSTRAINT prescription_id_patient_unique UNIQUE(id,patient_id),
    CONSTRAINT prescription_consultation_patient_fk FOREIGN KEY (consultation_id,patient_id)
        REFERENCES clinical_consultation(id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT prescription_correction_patient_fk FOREIGN KEY (corrects_prescription_id,patient_id)
        REFERENCES prescription(id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT prescription_correction_not_self CHECK (corrects_prescription_id IS NULL OR corrects_prescription_id <> id),
    -- Expand only with the future immutable snapshot/PDF workflow, never by accepting client status.
    CONSTRAINT prescription_draft_phase CHECK (status = 'BROUILLON' AND corrects_prescription_id IS NULL),
    CONSTRAINT prescription_archive CHECK ((archived_at IS NULL AND archived_by IS NULL)
        OR (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archived_at >= created_at AND archived_at <= updated_at))
);
CREATE INDEX prescription_patient_history_idx ON prescription(patient_id,issued_date DESC,id DESC);
CREATE INDEX prescription_consultation_idx ON prescription(consultation_id) WHERE consultation_id IS NOT NULL;
CREATE TABLE prescription_line (
    id uuid PRIMARY KEY,
    prescription_id uuid NOT NULL REFERENCES prescription(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
    medication_name varchar(200) NOT NULL,
    dosage varchar(300) NOT NULL,
    frequency varchar(200) NOT NULL,
    duration varchar(200) NOT NULL,
    instructions varchar(1500) NOT NULL,
    CONSTRAINT prescription_line_position_unique UNIQUE (prescription_id,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION guard_prescription() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Prescription deletion refused' USING ERRCODE='23514'; END IF;
    IF OLD.archived_at IS NOT NULL OR NEW.patient_id <> OLD.patient_id OR NEW.id <> OLD.id
        OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by
        OR NEW.corrects_prescription_id IS DISTINCT FROM OLD.corrects_prescription_id THEN
        RAISE EXCEPTION 'Prescription immutable fields' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER prescription_immutable BEFORE UPDATE OR DELETE ON prescription FOR EACH ROW EXECUTE FUNCTION guard_prescription();
CREATE FUNCTION guard_prescription_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; archived timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN parent_id := OLD.prescription_id; ELSE parent_id := NEW.prescription_id; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.prescription_id <> OLD.prescription_id) THEN
        RAISE EXCEPTION 'Prescription line ownership immutable' USING ERRCODE='23514';
    END IF;
    SELECT archived_at INTO archived FROM prescription WHERE id=parent_id FOR UPDATE;
    IF archived IS NOT NULL THEN RAISE EXCEPTION 'Archived prescription immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER prescription_line_editable BEFORE INSERT OR UPDATE OR DELETE ON prescription_line
    FOR EACH ROW EXECUTE FUNCTION guard_prescription_line();
CREATE FUNCTION check_prescription_line_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; line_count integer; last_position integer;
BEGIN
    IF TG_OP = 'DELETE' THEN parent_id := OLD.prescription_id; ELSE parent_id := NEW.prescription_id; END IF;
    SELECT count(*),max(position) INTO line_count,last_position FROM prescription_line WHERE prescription_id=parent_id;
    IF line_count > 0 AND last_position <> line_count - 1 THEN
        RAISE EXCEPTION 'Prescription positions must be contiguous' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER prescription_line_order AFTER INSERT OR UPDATE OR DELETE ON prescription_line
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_prescription_line_order();

ALTER TABLE security_audit_event ADD COLUMN target_prescription_id uuid REFERENCES prescription(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
    'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED',
    'PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_prescription_target CHECK (
    (event_type IN ('PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED')
        AND target_prescription_id IS NOT NULL AND actor_user_id IS NOT NULL AND subject_user_id IS NULL
        AND target_patient_id IS NULL AND target_appointment_id IS NULL AND target_consultation_id IS NULL)
    OR (event_type NOT IN ('PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED') AND target_prescription_id IS NULL)
);
CREATE INDEX security_audit_prescription_time_idx ON security_audit_event(target_prescription_id,occurred_at);
