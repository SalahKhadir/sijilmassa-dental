CREATE SEQUENCE patient_reference_seq START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE patient (
    id uuid CONSTRAINT patient_pk PRIMARY KEY,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    reference varchar(24) NOT NULL CONSTRAINT patient_reference_unique UNIQUE,
    first_name varchar(80) NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name varchar(80) NOT NULL CHECK (length(btrim(last_name)) > 0),
    sex varchar(16) NOT NULL CHECK (sex IN ('UNANSWERED', 'F', 'M')),
    date_of_birth date,
    address varchar(300) NOT NULL,
    gsm varchar(40) NOT NULL,
    landline varchar(40) NOT NULL,
    profession varchar(120) NOT NULL,
    cin varchar(30) NOT NULL,
    medical_coverage varchar(120) NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    search_name text NOT NULL CHECK (length(search_name) <= 4096),
    gsm_digits varchar(20) NOT NULL CHECK (gsm_digits ~ '^[0-9]{0,20}$'),
    landline_digits varchar(20) NOT NULL CHECK (landline_digits ~ '^[0-9]{0,20}$'),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT patient_reference_format CHECK (reference ~ '^PAT-[0-9]{6,19}$'),
    CONSTRAINT patient_timestamp_order CHECK (updated_at >= created_at),
    CONSTRAINT patient_birth_year CHECK (date_of_birth IS NULL OR date_of_birth BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);
CREATE INDEX patient_status_name_idx ON patient (status, last_name, first_name, id);
CREATE INDEX patient_status_created_idx ON patient (status, created_at, id);

CREATE TABLE patient_medical_record (
    patient_id uuid CONSTRAINT patient_medical_record_pk PRIMARY KEY
        REFERENCES patient(id) ON DELETE RESTRICT,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    questionnaire_version integer NOT NULL CHECK (questionnaire_version = 1),
    history_report_status varchar(16) NOT NULL CHECK (history_report_status IN ('UNANSWERED', 'REPORTED')),
    history_other_details varchar(1000) NOT NULL,
    allergy_report_status varchar(16) NOT NULL CHECK (allergy_report_status IN ('UNANSWERED', 'REPORTED')),
    allergy_clarification varchar(1000) NOT NULL,
    under_medical_treatment varchar(16) NOT NULL CHECK (under_medical_treatment IN ('UNANSWERED', 'YES', 'NO')),
    pregnant varchar(16) NOT NULL CHECK (pregnant IN ('UNANSWERED', 'YES', 'NO')),
    additional_information varchar(2000) NOT NULL,
    reason_for_consultation varchar(2000) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT medical_record_timestamp_order CHECK (updated_at >= created_at),
    CONSTRAINT history_unanswered_text CHECK (history_report_status <> 'UNANSWERED' OR history_other_details = ''),
    CONSTRAINT allergy_unanswered_text CHECK (allergy_report_status <> 'UNANSWERED' OR allergy_clarification = '')
);
CREATE TABLE patient_history_condition (
    patient_id uuid NOT NULL REFERENCES patient_medical_record(patient_id) ON DELETE RESTRICT,
    condition_code varchar(32) NOT NULL CHECK (condition_code IN (
        'CARDIAQUE', 'OSTEOPOROSE', 'CHIRURGIE', 'MALADIE_DU_SANG', 'DIABETE', 'SINUSITE', 'AUTRES', 'APPAREIL_GASTRIQUE')),
    CONSTRAINT patient_history_condition_pk PRIMARY KEY (patient_id, condition_code)
);
CREATE TABLE patient_allergy_category (
    patient_id uuid NOT NULL REFERENCES patient_medical_record(patient_id) ON DELETE RESTRICT,
    category_code varchar(32) NOT NULL CHECK (category_code IN ('ASPIRINE', 'ANTIBIOTIQUE', 'ANESTHESIE', 'ALIMENT', 'AUTRES')),
    CONSTRAINT patient_allergy_category_pk PRIMARY KEY (patient_id, category_code)
);

ALTER TABLE security_audit_event ADD COLUMN target_patient_id uuid REFERENCES patient(id) ON DELETE RESTRICT;
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
    'ACCOUNTS_BOOTSTRAPPED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT',
    'ACCOUNT_DISABLED', 'LOGIN_THROTTLED', 'SESSION_REVOKED', 'PATIENT_CREATED',
    'PATIENT_ADMIN_UPDATED', 'PATIENT_MEDICAL_UPDATED', 'PATIENT_ARCHIVED', 'PATIENT_RESTORED'
));
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_patient_target CHECK (
    (event_type IN ('PATIENT_CREATED', 'PATIENT_ADMIN_UPDATED', 'PATIENT_MEDICAL_UPDATED', 'PATIENT_ARCHIVED', 'PATIENT_RESTORED')
        AND target_patient_id IS NOT NULL AND actor_user_id IS NOT NULL AND subject_user_id IS NULL)
    OR (event_type NOT IN ('PATIENT_CREATED', 'PATIENT_ADMIN_UPDATED', 'PATIENT_MEDICAL_UPDATED', 'PATIENT_ARCHIVED', 'PATIENT_RESTORED')
        AND target_patient_id IS NULL)
);
CREATE INDEX security_audit_patient_time_idx ON security_audit_event (target_patient_id, occurred_at);
