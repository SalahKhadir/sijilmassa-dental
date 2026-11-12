ALTER TABLE invoice_line ADD COLUMN issued_tooth_reference varchar(50);
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_tooth_snapshot_shape CHECK (
    issued_tooth_reference IS NULL OR (issued_price_minor IS NOT NULL AND issued_tooth_reference <> '')
);

CREATE OR REPLACE FUNCTION snapshot_issued_invoice_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- V10 already holds the charge locks. Lock the treatment rows while reading the mutable reference.
    WITH sources AS MATERIALIZED (
        SELECT c.id, c.treatment_date, c.treatment_label, c.price_minor, NULLIF(t.tooth_reference, '') AS tooth_reference
        FROM invoice_line l
        JOIN treatment_charge c ON c.id = l.charge_id AND c.patient_id = NEW.patient_id
        JOIN clinical_treatment t ON t.id = c.treatment_id AND t.consultation_id = c.consultation_id
        WHERE l.invoice_id = NEW.id
        ORDER BY t.id FOR SHARE OF t
    )
    UPDATE invoice_line l
       SET issued_treatment_date = c.treatment_date, issued_treatment_label = c.treatment_label,
           issued_price_minor = c.price_minor,
           issued_received_minor = COALESCE((SELECT sum(p.amount_minor) FROM treatment_payment p WHERE p.charge_id = c.id), 0),
           issued_tooth_reference = c.tooth_reference
      FROM sources c WHERE l.invoice_id = NEW.id AND l.charge_id = c.id;

    IF EXISTS (SELECT 1 FROM invoice_line WHERE invoice_id = NEW.id AND issued_price_minor IS NULL) THEN
        RAISE EXCEPTION 'Invoice line snapshot unavailable';
    END IF;
    RETURN NULL;
END;
$$;
