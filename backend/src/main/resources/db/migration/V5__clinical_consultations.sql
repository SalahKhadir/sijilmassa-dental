-- The composite key prevents both mismatched links and later appointment reassignment.
ALTER TABLE appointment ADD CONSTRAINT appointment_id_patient_unique UNIQUE (id, patient_id);

CREATE TABLE clinical_consultation (
    id uuid CONSTRAINT clinical_consultation_pk PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    appointment_id uuid CONSTRAINT clinical_consultation_appointment_unique UNIQUE,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    consultation_date date NOT NULL CHECK (consultation_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    status varchar(16) NOT NULL CHECK (status IN ('BROUILLON', 'TERMINEE')),
    chief_complaint varchar(500) NOT NULL CHECK (length(btrim(chief_complaint)) > 0),
    clinical_observations varchar(5000) NOT NULL,
    assessment varchar(5000) NOT NULL,
    treatment_plan varchar(5000) NOT NULL,
    notes varchar(5000) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT clinical_consultation_timestamp_order CHECK (updated_at >= created_at),
    CONSTRAINT clinical_consultation_appointment_patient_fk FOREIGN KEY (appointment_id, patient_id)
        REFERENCES appointment(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX clinical_consultation_patient_history_idx ON clinical_consultation (patient_id, consultation_date DESC, id DESC);

CREATE TABLE clinical_treatment (
    id uuid CONSTRAINT clinical_treatment_pk PRIMARY KEY,
    consultation_id uuid NOT NULL REFERENCES clinical_consultation(id) ON DELETE RESTRICT,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    treatment_date date NOT NULL CHECK (treatment_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    description varchar(1000) NOT NULL CHECK (length(btrim(description)) > 0),
    tooth_reference varchar(50) NOT NULL,
    notes varchar(2000) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT clinical_treatment_timestamp_order CHECK (updated_at >= created_at)
);
CREATE INDEX clinical_treatment_chronology_idx ON clinical_treatment (consultation_id, treatment_date, id);
