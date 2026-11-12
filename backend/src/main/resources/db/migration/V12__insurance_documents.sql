CREATE TABLE insurance_document (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    consultation_id uuid,
    document_type varchar(16) NOT NULL,
    template_version smallint NOT NULL CHECK (template_version = 1),
    purpose varchar(20) NOT NULL CHECK (purpose IN ('EXECUTION','ENTENTE_PREALABLE','DEVIS','RECUS')),
    lifecycle varchar(12) NOT NULL CHECK (lifecycle IN ('BROUILLON','FINALISE')),
    version bigint NOT NULL CHECK (version BETWEEN 0 AND 9007199254740991),
    form_data jsonb NOT NULL CHECK (jsonb_typeof(form_data) = 'object' AND octet_length(form_data::text) <= 32768),
    final_snapshot jsonb,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
    created_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT,
    finalized_at timestamptz,
    finalized_by uuid REFERENCES application_user(id) ON DELETE RESTRICT,
    UNIQUE (id, patient_id),
    UNIQUE (id, consultation_id),
    FOREIGN KEY (consultation_id, patient_id) REFERENCES clinical_consultation(id, patient_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK (
        (document_type = 'CNSS_DENTAIRE' AND purpose IN ('EXECUTION','ENTENTE_PREALABLE')
            AND (jsonb_typeof(form_data->'cnss') = 'object') IS TRUE
            AND jsonb_typeof(form_data->'cnops') IS DISTINCT FROM 'object'
            AND jsonb_typeof(form_data->'far') IS DISTINCT FROM 'object')
        OR (document_type = 'CNOPS_DENTAIRE' AND purpose IN ('EXECUTION','ENTENTE_PREALABLE')
            AND (jsonb_typeof(form_data->'cnops') = 'object') IS TRUE
            AND jsonb_typeof(form_data->'cnss') IS DISTINCT FROM 'object'
            AND jsonb_typeof(form_data->'far') IS DISTINCT FROM 'object')
        OR (document_type = 'FAR_DENTAIRE' AND purpose IN ('DEVIS','RECUS')
            AND (jsonb_typeof(form_data->'far') = 'object') IS TRUE
            AND jsonb_typeof(form_data->'cnss') IS DISTINCT FROM 'object'
            AND jsonb_typeof(form_data->'cnops') IS DISTINCT FROM 'object')
    ),
    CHECK (
        (lifecycle = 'BROUILLON' AND final_snapshot IS NULL AND finalized_at IS NULL AND finalized_by IS NULL)
        OR (lifecycle = 'FINALISE' AND final_snapshot IS NOT NULL AND jsonb_typeof(final_snapshot) = 'object'
            AND octet_length(final_snapshot::text) <= 65536
            AND (final_snapshot->'schemaVersion' = '1'::jsonb) IS TRUE
            AND (final_snapshot->'templateVersion' = to_jsonb(template_version)) IS TRUE
            AND (final_snapshot->>'templateSha256' ~ '^[0-9a-f]{64}$') IS TRUE
            AND (final_snapshot->'fields' = form_data) IS TRUE
            AND (final_snapshot->>'documentType' = document_type) IS TRUE
            AND (final_snapshot->>'purpose' = purpose) IS TRUE
            AND (final_snapshot->'beneficiary'->>'patientId' = patient_id::text) IS TRUE
            AND (final_snapshot->'consultation'->>'consultationId') IS NOT DISTINCT FROM consultation_id::text
            AND (jsonb_typeof(final_snapshot->'insured') = 'object') IS TRUE
            AND (jsonb_typeof(final_snapshot->'acts') = 'array') IS TRUE
            AND finalized_at IS NOT NULL AND finalized_at = updated_at
            AND finalized_by IS NOT NULL AND finalized_by = updated_by)
    )
);
CREATE INDEX insurance_document_patient_history_idx ON insurance_document (patient_id, created_at DESC, id DESC);
CREATE INDEX insurance_document_consultation_idx ON insurance_document (consultation_id) WHERE consultation_id IS NOT NULL;

CREATE TABLE insurance_act (
    document_id uuid NOT NULL REFERENCES insurance_document(id) ON DELETE RESTRICT,
    line_position smallint NOT NULL CHECK (line_position BETWEEN 1 AND 9),
    treatment_id uuid,
    consultation_id uuid,
    charge_id uuid REFERENCES treatment_charge(id) ON DELETE RESTRICT,
    act_data jsonb NOT NULL CHECK (jsonb_typeof(act_data) = 'object' AND octet_length(act_data::text) <= 4096),
    PRIMARY KEY (document_id, line_position),
    UNIQUE (document_id, treatment_id),
    UNIQUE (document_id, charge_id),
    FOREIGN KEY (document_id, consultation_id) REFERENCES insurance_document(id, consultation_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    FOREIGN KEY (treatment_id, consultation_id) REFERENCES clinical_treatment(id, consultation_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK ((treatment_id IS NULL) = (consultation_id IS NULL)),
    CHECK (charge_id IS NULL OR treatment_id IS NOT NULL)
);
CREATE INDEX insurance_act_treatment_idx ON insurance_act (treatment_id) WHERE treatment_id IS NOT NULL;
CREATE INDEX insurance_act_charge_idx ON insurance_act (charge_id) WHERE charge_id IS NOT NULL;

CREATE FUNCTION guard_insurance_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Insurance history retained' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.lifecycle <> 'BROUILLON' OR NEW.version <> 0 OR NEW.created_at <> NEW.updated_at
            OR NEW.created_by <> NEW.updated_by THEN
            RAISE EXCEPTION 'Insurance document must start as a draft' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF OLD.lifecycle <> 'BROUILLON'
            OR ROW(NEW.id, NEW.patient_id, NEW.consultation_id, NEW.document_type, NEW.template_version, NEW.purpose,
                   NEW.created_at, NEW.created_by)
                IS DISTINCT FROM ROW(OLD.id, OLD.patient_id, OLD.consultation_id, OLD.document_type, OLD.template_version,
                   OLD.purpose, OLD.created_at, OLD.created_by)
            OR NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at THEN
            RAISE EXCEPTION 'Insurance document transition refused' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = NEW.patient_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Insurance patient unavailable' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM application_user WHERE id = NEW.updated_by AND active AND role = 'DENTIST') THEN
        RAISE EXCEPTION 'Insurance actor refused' USING ERRCODE = '23514';
    END IF;
    IF NEW.lifecycle = 'FINALISE' THEN
        IF NEW.form_data IS DISTINCT FROM OLD.form_data
            OR NOT EXISTS (SELECT 1 FROM insurance_act WHERE document_id = NEW.id)
            OR (CASE WHEN jsonb_typeof(NEW.final_snapshot->'acts') = 'array'
                THEN jsonb_array_length(NEW.final_snapshot->'acts') <>
                    (SELECT count(*) FROM insurance_act WHERE document_id = NEW.id)
                ELSE TRUE END)
            OR (NEW.purpose IN ('EXECUTION','RECUS') AND (
                NOT EXISTS (SELECT 1 FROM clinical_consultation WHERE id = NEW.consultation_id
                    AND patient_id = NEW.patient_id AND status = 'TERMINEE')
                OR EXISTS (SELECT 1 FROM insurance_act a LEFT JOIN clinical_treatment t ON t.id = a.treatment_id
                    WHERE a.document_id = NEW.id AND (t.id IS NULL OR t.removed_at IS NOT NULL
                        OR (NEW.document_type = 'FAR_DENTAIRE' AND a.charge_id IS NULL))))) THEN
            RAISE EXCEPTION 'Insurance finalization source refused' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION guard_insurance_act() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent insurance_document%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Replace draft insurance acts explicitly' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO parent FROM insurance_document
        WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.document_id ELSE OLD.document_id END FOR UPDATE;
    IF NOT FOUND OR parent.lifecycle <> 'BROUILLON'
        OR NOT EXISTS (SELECT 1 FROM patient WHERE id = parent.patient_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Insurance acts are read-only' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    NEW.consultation_id := CASE WHEN NEW.treatment_id IS NOT NULL THEN parent.consultation_id END;
    IF NEW.line_position > (CASE parent.document_type WHEN 'CNSS_DENTAIRE' THEN 3 WHEN 'FAR_DENTAIRE' THEN 5 ELSE 9 END)
        OR (parent.purpose IN ('ENTENTE_PREALABLE','DEVIS') AND NEW.treatment_id IS NOT NULL)
        OR (NEW.treatment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clinical_treatment
            WHERE id = NEW.treatment_id AND consultation_id = parent.consultation_id AND removed_at IS NULL))
        OR (NEW.charge_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM treatment_charge
            WHERE id = NEW.charge_id AND patient_id = parent.patient_id
                AND consultation_id = parent.consultation_id AND treatment_id = NEW.treatment_id)) THEN
        RAISE EXCEPTION 'Insurance act source refused' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER insurance_document_guard BEFORE INSERT OR UPDATE OR DELETE ON insurance_document
    FOR EACH ROW EXECUTE FUNCTION guard_insurance_document();
CREATE TRIGGER insurance_act_guard BEFORE INSERT OR UPDATE OR DELETE ON insurance_act
    FOR EACH ROW EXECUTE FUNCTION guard_insurance_act();

ALTER TABLE security_audit_event ADD COLUMN target_insurance_document_id uuid;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_insurance_patient_fk
    FOREIGN KEY (target_insurance_document_id, target_patient_id)
    REFERENCES insurance_document(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
    'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED','PATIENT_MEDICAL_UPDATED',
    'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
    'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED',
    'PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED',
    'TREATMENT_CHARGE_CREATED','TREATMENT_PAYMENT_RECORDED','INVOICE_CREATED','INVOICE_DRAFT_UPDATED','INVOICE_ISSUED',
    'INSURANCE_DOCUMENT_CREATED','INSURANCE_DRAFT_UPDATED','INSURANCE_DOCUMENT_FINALIZED'
));
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_patient_target;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_patient_target CHECK (
    (event_type IN ('PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
        'INSURANCE_DOCUMENT_CREATED','INSURANCE_DRAFT_UPDATED','INSURANCE_DOCUMENT_FINALIZED')
        AND target_patient_id IS NOT NULL AND actor_user_id IS NOT NULL AND subject_user_id IS NULL)
    OR (event_type NOT IN ('PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
        'INSURANCE_DOCUMENT_CREATED','INSURANCE_DRAFT_UPDATED','INSURANCE_DOCUMENT_FINALIZED') AND target_patient_id IS NULL)
);
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_insurance_target CHECK (
    (event_type IN ('INSURANCE_DOCUMENT_CREATED','INSURANCE_DRAFT_UPDATED','INSURANCE_DOCUMENT_FINALIZED'))
    = (target_insurance_document_id IS NOT NULL)
);
CREATE INDEX security_audit_insurance_time_idx ON security_audit_event (target_insurance_document_id, occurred_at)
    WHERE target_insurance_document_id IS NOT NULL;
