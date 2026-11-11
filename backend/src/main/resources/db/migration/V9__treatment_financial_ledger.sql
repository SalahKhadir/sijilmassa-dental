-- One permanent agreed charge per clinical treatment. No invoices or editable patient balance.
ALTER TABLE clinical_treatment ADD CONSTRAINT clinical_treatment_id_consultation_unique UNIQUE (id, consultation_id);
CREATE TABLE treatment_charge (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    consultation_id uuid NOT NULL,
    treatment_id uuid NOT NULL UNIQUE,
    treatment_date date NOT NULL CHECK (treatment_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    treatment_label varchar(1000) NOT NULL CHECK (length(btrim(treatment_label)) > 0),
    price_minor bigint NOT NULL CHECK (price_minor BETWEEN 0 AND 9007199254740991),
    currency varchar(3) NOT NULL CHECK (currency = 'MAD'),
    version bigint NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    created_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    CONSTRAINT treatment_charge_consultation_patient_fk FOREIGN KEY (consultation_id, patient_id)
        REFERENCES clinical_consultation(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT treatment_charge_treatment_consultation_fk FOREIGN KEY (treatment_id, consultation_id)
        REFERENCES clinical_treatment(id, consultation_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX treatment_charge_patient_history_idx ON treatment_charge(patient_id, treatment_date, id);
CREATE INDEX treatment_charge_consultation_idx ON treatment_charge(consultation_id);
CREATE TABLE treatment_payment (
    id uuid PRIMARY KEY,
    charge_id uuid NOT NULL REFERENCES treatment_charge(id) ON DELETE RESTRICT,
    operation_id uuid NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
    paid_at timestamptz NOT NULL CHECK (paid_at >= TIMESTAMPTZ '0001-01-01 00:00Z' AND paid_at < TIMESTAMPTZ '10000-01-01 00:00Z'),
    method varchar(16) NOT NULL CHECK (method IN ('ESPECES','CARTE','VIREMENT','CHEQUE','AUTRE')),
    recorded_at timestamptz NOT NULL,
    recorded_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    CONSTRAINT treatment_payment_operation_unique UNIQUE (charge_id, operation_id),
    CONSTRAINT treatment_payment_id_charge_unique UNIQUE (id, charge_id)
);
CREATE INDEX treatment_payment_history_idx ON treatment_payment(charge_id, paid_at, id);

CREATE FUNCTION guard_treatment_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p_status varchar; c_status varchar; actual_date date; actual_label varchar; removed timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Financial history immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.id,NEW.patient_id,NEW.consultation_id,NEW.treatment_id,NEW.treatment_date,NEW.treatment_label,NEW.price_minor,NEW.currency,NEW.created_at,NEW.created_by)
            IS DISTINCT FROM ROW(OLD.id,OLD.patient_id,OLD.consultation_id,OLD.treatment_id,OLD.treatment_date,OLD.treatment_label,OLD.price_minor,OLD.currency,OLD.created_at,OLD.created_by)
            OR NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at THEN
            RAISE EXCEPTION 'Financial charge immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    -- Same order as the service: actor, patient, consultation, treatment, then charge.
    PERFORM 1 FROM application_user WHERE id=NEW.created_by AND active AND role='DENTIST' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial actor refused' USING ERRCODE='23514'; END IF;
    SELECT status INTO p_status FROM patient WHERE id=NEW.patient_id FOR SHARE;
    SELECT status INTO c_status FROM clinical_consultation WHERE id=NEW.consultation_id AND patient_id=NEW.patient_id FOR UPDATE;
    SELECT treatment_date,description,removed_at INTO actual_date,actual_label,removed
        FROM clinical_treatment WHERE id=NEW.treatment_id AND consultation_id=NEW.consultation_id FOR SHARE;
    IF p_status IS DISTINCT FROM 'ACTIVE' OR c_status IS DISTINCT FROM 'BROUILLON'
        OR actual_date IS NULL OR removed IS NOT NULL OR actual_date IS DISTINCT FROM NEW.treatment_date
        OR actual_label IS DISTINCT FROM NEW.treatment_label OR NEW.version <> 0 OR NEW.created_at <> NEW.updated_at THEN
        RAISE EXCEPTION 'Financial source refused' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER treatment_charge_guard BEFORE INSERT OR UPDATE OR DELETE ON treatment_charge
    FOR EACH ROW EXECUTE FUNCTION guard_treatment_charge();

CREATE FUNCTION protect_charged_treatment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM treatment_charge WHERE treatment_id=OLD.id) THEN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Charged treatment retained' USING ERRCODE='23514'; END IF;
        IF ROW(NEW.id,NEW.consultation_id,NEW.treatment_date,NEW.description,NEW.removed_at)
            IS DISTINCT FROM ROW(OLD.id,OLD.consultation_id,OLD.treatment_date,OLD.description,OLD.removed_at) THEN
            RAISE EXCEPTION 'Charged treatment financial identity immutable' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER clinical_treatment_financial_identity BEFORE UPDATE OR DELETE ON clinical_treatment
    FOR EACH ROW EXECUTE FUNCTION protect_charged_treatment();

CREATE FUNCTION guard_treatment_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source treatment_charge%ROWTYPE; patient_state varchar; received numeric;
BEGIN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Payment immutable' USING ERRCODE='23514'; END IF;
    PERFORM 1 FROM application_user WHERE id=NEW.recorded_by AND active AND role IN ('DENTIST','RECEPTIONIST') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment actor refused' USING ERRCODE='23514'; END IF;
    SELECT * INTO source FROM treatment_charge WHERE id=NEW.charge_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment charge missing' USING ERRCODE='23503'; END IF;
    SELECT status INTO patient_state FROM patient WHERE id=source.patient_id FOR SHARE;
    PERFORM 1 FROM clinical_consultation WHERE id=source.consultation_id FOR SHARE;
    SELECT * INTO source FROM treatment_charge WHERE id=NEW.charge_id FOR UPDATE;
    SELECT COALESCE(sum(amount_minor),0) INTO received FROM treatment_payment WHERE charge_id=NEW.charge_id;
    IF patient_state <> 'ACTIVE' OR NEW.amount_minor <= 0 OR received+NEW.amount_minor > source.price_minor
        OR source.version=9007199254740991 OR NEW.recorded_at <= source.updated_at THEN
        RAISE EXCEPTION 'Payment refused' USING ERRCODE='23514';
    END IF;
    UPDATE treatment_charge SET version=version+1,updated_at=NEW.recorded_at WHERE id=source.id;
    RETURN NEW;
END $$;
CREATE TRIGGER treatment_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON treatment_payment
    FOR EACH ROW EXECUTE FUNCTION guard_treatment_payment();
-- Verify both sides at commit; no independently editable received/balance counter.
CREATE FUNCTION check_treatment_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE charge uuid; price bigint; expected bigint; entries bigint; received numeric;
BEGIN
    IF TG_TABLE_NAME='treatment_charge' THEN charge:=NEW.id; ELSE charge:=NEW.charge_id; END IF;
    SELECT price_minor,version INTO price,expected FROM treatment_charge WHERE id=charge;
    SELECT count(*),COALESCE(sum(amount_minor),0) INTO entries,received FROM treatment_payment WHERE charge_id=charge;
    IF expected <> entries OR received > price THEN RAISE EXCEPTION 'Financial ledger inconsistent' USING ERRCODE='23514'; END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER treatment_charge_consistent AFTER INSERT OR UPDATE ON treatment_charge
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_treatment_ledger();
CREATE CONSTRAINT TRIGGER treatment_payment_consistent AFTER INSERT ON treatment_payment
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_treatment_ledger();

ALTER TABLE security_audit_event ADD COLUMN target_charge_id uuid REFERENCES treatment_charge(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event ADD COLUMN target_payment_id uuid;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_payment_charge_fk FOREIGN KEY (target_payment_id,target_charge_id)
    REFERENCES treatment_payment(id,charge_id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
    'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED',
    'PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED',
    'TREATMENT_CHARGE_CREATED','TREATMENT_PAYMENT_RECORDED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_financial_target CHECK (
    (event_type='TREATMENT_CHARGE_CREATED' AND target_charge_id IS NOT NULL AND target_payment_id IS NULL
        AND actor_user_id IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL
        AND target_appointment_id IS NULL AND target_consultation_id IS NULL AND target_prescription_id IS NULL)
    OR (event_type='TREATMENT_PAYMENT_RECORDED' AND target_charge_id IS NOT NULL AND target_payment_id IS NOT NULL
        AND actor_user_id IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL
        AND target_appointment_id IS NULL AND target_consultation_id IS NULL AND target_prescription_id IS NULL)
    OR (event_type NOT IN ('TREATMENT_CHARGE_CREATED','TREATMENT_PAYMENT_RECORDED') AND target_charge_id IS NULL AND target_payment_id IS NULL)
);
CREATE INDEX security_audit_charge_time_idx ON security_audit_event(target_charge_id,occurred_at);
CREATE INDEX security_audit_payment_idx ON security_audit_event(target_payment_id) WHERE target_payment_id IS NOT NULL;
