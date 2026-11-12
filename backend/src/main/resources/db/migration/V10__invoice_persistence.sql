CREATE TABLE invoice_number_sequence (
    invoice_year integer PRIMARY KEY CHECK (invoice_year BETWEEN 1 AND 9999),
    last_number bigint NOT NULL CHECK (last_number > 0)
);

CREATE TABLE invoice (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    lifecycle varchar(10) NOT NULL CHECK (lifecycle IN ('BROUILLON','EMISE')),
    version bigint NOT NULL CHECK (version BETWEEN 0 AND 9007199254740991),
    created_at timestamptz NOT NULL,
    created_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    invoice_number varchar(24) UNIQUE,
    issued_at timestamptz,
    issued_date date,
    issued_by uuid REFERENCES application_user(id) ON DELETE RESTRICT,
    issued_patient_reference varchar(24),
    issued_first_name varchar(80),
    issued_last_name varchar(80),
    CONSTRAINT invoice_lifecycle_shape CHECK (
        (lifecycle = 'BROUILLON' AND invoice_number IS NULL AND issued_at IS NULL AND issued_date IS NULL
            AND issued_by IS NULL AND issued_patient_reference IS NULL AND issued_first_name IS NULL AND issued_last_name IS NULL)
        OR
        (lifecycle = 'EMISE' AND invoice_number IS NOT NULL AND issued_at IS NOT NULL AND issued_at = updated_at
            AND issued_date IS NOT NULL AND issued_by IS NOT NULL AND issued_patient_reference IS NOT NULL
            AND issued_first_name IS NOT NULL AND issued_last_name IS NOT NULL)
    )
);
CREATE INDEX invoice_patient_idx ON invoice(patient_id, created_at, id);

CREATE TABLE invoice_line (
    invoice_id uuid NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
    charge_id uuid NOT NULL REFERENCES treatment_charge(id) ON DELETE RESTRICT,
    line_position integer NOT NULL CHECK (line_position BETWEEN 1 AND 250),
    issued_treatment_date date,
    issued_treatment_label varchar(1000),
    issued_price_minor bigint,
    issued_received_minor bigint,
    PRIMARY KEY (invoice_id, charge_id),
    CONSTRAINT invoice_line_charge_reservation UNIQUE (charge_id),
    CONSTRAINT invoice_line_position UNIQUE (invoice_id, line_position),
    CONSTRAINT invoice_line_snapshot_shape CHECK (
        (issued_treatment_date IS NULL AND issued_treatment_label IS NULL AND issued_price_minor IS NULL AND issued_received_minor IS NULL)
        OR (issued_treatment_date IS NOT NULL AND issued_treatment_label IS NOT NULL AND issued_price_minor IS NOT NULL
            AND issued_received_minor IS NOT NULL AND issued_price_minor BETWEEN 0 AND 9007199254740991
            AND issued_received_minor BETWEEN 0 AND issued_price_minor)
    )
);

CREATE FUNCTION guard_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    owner patient%ROWTYPE;
    year_number integer;
    allocated bigint;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Invoice history is retained' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.lifecycle <> 'BROUILLON' OR NEW.version <> 0 THEN
            RAISE EXCEPTION 'Invoice must start as draft' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF OLD.lifecycle <> 'BROUILLON'
            OR ROW(NEW.id, NEW.patient_id, NEW.created_at, NEW.created_by)
                IS DISTINCT FROM ROW(OLD.id, OLD.patient_id, OLD.created_at, OLD.created_by)
            OR NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at THEN
            RAISE EXCEPTION 'Invoice mutation not permitted' USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT * INTO owner FROM patient WHERE id = NEW.patient_id FOR SHARE;
    IF NOT FOUND OR owner.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Invoice requires active patient' USING ERRCODE = '23514';
    END IF;
    IF NEW.lifecycle = 'BROUILLON' THEN
        RETURN NEW;
    END IF;
    IF NEW.lifecycle <> 'EMISE' OR NEW.issued_at IS NULL OR NEW.issued_by IS NULL OR NEW.invoice_number IS NOT NULL OR NEW.issued_date IS NOT NULL
        OR NEW.issued_patient_reference IS NOT NULL OR NEW.issued_first_name IS NOT NULL OR NEW.issued_last_name IS NOT NULL THEN
        RAISE EXCEPTION 'Invalid invoice issuance fields' USING ERRCODE = '23514';
    END IF;

    -- V9 payment writers take the same charge row lock before inserting a payment.
    PERFORM c.id FROM invoice_line l JOIN treatment_charge c ON c.id = l.charge_id
        WHERE l.invoice_id = OLD.id AND c.patient_id = OLD.patient_id ORDER BY c.id FOR UPDATE OF c;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice requires a charge' USING ERRCODE = '23514';
    END IF;

    NEW.issued_date := (NEW.issued_at AT TIME ZONE 'Africa/Casablanca')::date;
    year_number := EXTRACT(YEAR FROM NEW.issued_date)::integer;
    INSERT INTO invoice_number_sequence (invoice_year, last_number) VALUES (year_number, 1)
        ON CONFLICT (invoice_year) DO UPDATE SET last_number = invoice_number_sequence.last_number + 1
        RETURNING last_number INTO allocated;
    NEW.invoice_number := lpad(year_number::text, 4, '0') || '-' || lpad(allocated::text, greatest(3, length(allocated::text)), '0');
    NEW.issued_patient_reference := owner.reference;
    NEW.issued_first_name := owner.first_name;
    NEW.issued_last_name := owner.last_name;
    RETURN NEW;
END;
$$;

CREATE FUNCTION guard_invoice_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent invoice%ROWTYPE;
    target uuid;
BEGIN
    target := CASE WHEN TG_OP = 'INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
    SELECT * INTO parent FROM invoice WHERE id = target FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE = '23503';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- The issuance trigger is the only writer of the initial snapshot.
        IF parent.lifecycle <> 'EMISE' OR OLD.issued_price_minor IS NOT NULL OR NEW.issued_price_minor IS NULL
            OR ROW(NEW.invoice_id, NEW.charge_id, NEW.line_position)
                IS DISTINCT FROM ROW(OLD.invoice_id, OLD.charge_id, OLD.line_position) THEN
            RAISE EXCEPTION 'Invoice line immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF parent.lifecycle <> 'BROUILLON' THEN
        RAISE EXCEPTION 'Issued invoice membership immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NEW.issued_treatment_date IS NOT NULL OR NEW.issued_treatment_label IS NOT NULL
        OR NEW.issued_price_minor IS NOT NULL OR NEW.issued_received_minor IS NOT NULL THEN
        RAISE EXCEPTION 'Draft line cannot have an issuance snapshot' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM treatment_charge WHERE id = NEW.charge_id AND patient_id = parent.patient_id) THEN
        RAISE EXCEPTION 'Invoice charge outside patient scope' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION snapshot_issued_invoice_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE invoice_line l
       SET issued_treatment_date = c.treatment_date, issued_treatment_label = c.treatment_label,
           issued_price_minor = c.price_minor,
           issued_received_minor = COALESCE((SELECT sum(p.amount_minor) FROM treatment_payment p WHERE p.charge_id = c.id), 0)
      FROM treatment_charge c WHERE l.invoice_id = NEW.id AND l.charge_id = c.id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice FOR EACH ROW EXECUTE FUNCTION guard_invoice();
CREATE TRIGGER invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_line FOR EACH ROW EXECUTE FUNCTION guard_invoice_line();
CREATE TRIGGER invoice_snapshot AFTER UPDATE ON invoice FOR EACH ROW
    WHEN (OLD.lifecycle = 'BROUILLON' AND NEW.lifecycle = 'EMISE') EXECUTE FUNCTION snapshot_issued_invoice_lines();

ALTER TABLE security_audit_event ADD COLUMN target_invoice_id uuid REFERENCES invoice(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED','PATIENT_MEDICAL_UPDATED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
    'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED',
    'PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED',
    'TREATMENT_CHARGE_CREATED','TREATMENT_PAYMENT_RECORDED',
    'INVOICE_CREATED','INVOICE_DRAFT_UPDATED','INVOICE_ISSUED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_invoice_target CHECK (
    (event_type IN ('INVOICE_CREATED','INVOICE_DRAFT_UPDATED','INVOICE_ISSUED') AND target_invoice_id IS NOT NULL
        AND actor_user_id IS NOT NULL AND subject_user_id IS NULL AND target_patient_id IS NULL AND target_appointment_id IS NULL
        AND target_consultation_id IS NULL AND target_prescription_id IS NULL AND target_charge_id IS NULL AND target_payment_id IS NULL)
    OR (event_type NOT IN ('INVOICE_CREATED','INVOICE_DRAFT_UPDATED','INVOICE_ISSUED') AND target_invoice_id IS NULL)
);
CREATE INDEX security_audit_invoice_time_idx ON security_audit_event (target_invoice_id, occurred_at) WHERE target_invoice_id IS NOT NULL;
