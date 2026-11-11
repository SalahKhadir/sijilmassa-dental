-- Finalized documents are stored atomically with the aggregate, never regenerated.
ALTER TABLE prescription ADD COLUMN finalized_at timestamptz;
ALTER TABLE prescription ADD COLUMN finalized_by uuid REFERENCES application_user(id) ON DELETE RESTRICT;
ALTER TABLE prescription DROP CONSTRAINT prescription_draft_phase;
ALTER TABLE prescription ADD CONSTRAINT prescription_lifecycle CHECK (corrects_prescription_id IS NULL AND (
 (status='BROUILLON' AND finalized_at IS NULL AND finalized_by IS NULL) OR
 (status='FINALISEE' AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL AND finalized_at=updated_at
 AND finalized_by=updated_by AND finalized_at>=created_at AND archived_at IS NULL AND archived_by IS NULL)));
CREATE TABLE prescription_document (
 prescription_id uuid PRIMARY KEY REFERENCES prescription(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='1'
 AND jsonb_typeof(snapshot->'prescription')='object' AND jsonb_typeof(snapshot->'patient')='object'
 AND jsonb_typeof(snapshot->'practitioner')='object' AND jsonb_typeof(snapshot->'generation')='object'
 AND jsonb_typeof(snapshot->'prescription'->'medications')='array'
 AND jsonb_array_length(snapshot->'prescription'->'medications') BETWEEN 1 AND 20 AND octet_length(snapshot::text)<=262144, false)),
 pdf_bytes bytea NOT NULL CHECK (octet_length(pdf_bytes) BETWEEN 1 AND 2097152),
 pdf_sha256 varchar(64) NOT NULL CHECK (pdf_sha256=encode(sha256(pdf_bytes),'hex')),
 pdf_size integer NOT NULL CHECK (pdf_size=octet_length(pdf_bytes)),
 finalized_at timestamptz NOT NULL, finalized_by uuid NOT NULL REFERENCES application_user(id) ON DELETE RESTRICT);
CREATE FUNCTION guard_prescription_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Finalized document immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER prescription_document_immutable BEFORE UPDATE OR DELETE ON prescription_document
 FOR EACH ROW EXECUTE FUNCTION guard_prescription_document();
CREATE OR REPLACE FUNCTION guard_prescription() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Prescription deletion refused' USING ERRCODE='23514'; END IF;
 IF OLD.status='FINALISEE' OR OLD.archived_at IS NOT NULL OR NEW.patient_id<>OLD.patient_id OR NEW.id<>OLD.id
 OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by
 OR NEW.corrects_prescription_id IS DISTINCT FROM OLD.corrects_prescription_id THEN
 RAISE EXCEPTION 'Prescription immutable fields' USING ERRCODE='23514'; END IF;
 IF NEW.status='FINALISEE' AND (NEW.version<>OLD.version+1 OR NEW.finalized_at<=OLD.updated_at) THEN
 RAISE EXCEPTION 'Finalization version and time must advance' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_prescription_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; archived timestamptz; parent_status varchar;
BEGIN
 IF TG_OP='DELETE' THEN parent_id:=OLD.prescription_id; ELSE parent_id:=NEW.prescription_id; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.prescription_id<>OLD.prescription_id) THEN
 RAISE EXCEPTION 'Prescription line ownership immutable' USING ERRCODE='23514'; END IF;
 SELECT archived_at,status INTO archived,parent_status FROM prescription WHERE id=parent_id FOR UPDATE;
 IF archived IS NOT NULL OR parent_status='FINALISEE' THEN
 RAISE EXCEPTION 'Prescription lines immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION check_prescription_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; p prescription%ROWTYPE; d prescription_document%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='prescription' THEN parent_id:=NEW.id; ELSE parent_id:=NEW.prescription_id; END IF;
 SELECT * INTO p FROM prescription WHERE id=parent_id;
 SELECT * INTO d FROM prescription_document WHERE prescription_id=parent_id;
 IF (p.status='FINALISEE')<>(d.prescription_id IS NOT NULL) THEN
 RAISE EXCEPTION 'Finalization requires one document' USING ERRCODE='23514'; END IF;
 IF p.status='FINALISEE' AND (
 d.finalized_at<>p.finalized_at OR d.finalized_by<>p.finalized_by
 OR (d.snapshot->>'finalizedAt')::timestamptz IS DISTINCT FROM p.finalized_at
 OR (d.snapshot->>'finalizedBy')::uuid IS DISTINCT FROM p.finalized_by
 OR (d.snapshot->'prescription'->>'id')::uuid IS DISTINCT FROM p.id
 OR (d.snapshot->'prescription'->>'patientId')::uuid IS DISTINCT FROM p.patient_id
 OR (d.snapshot->'patient'->>'id')::uuid IS DISTINCT FROM p.patient_id
 OR (d.snapshot->'prescription'->>'version')::bigint IS DISTINCT FROM p.version-1
 OR (d.snapshot->'practitioner'->>'dentistUserId')::uuid IS DISTINCT FROM p.finalized_by) THEN
 RAISE EXCEPTION 'Finalized document metadata mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER prescription_document_required AFTER INSERT OR UPDATE ON prescription
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_prescription_document();
CREATE CONSTRAINT TRIGGER prescription_document_coherent AFTER INSERT ON prescription_document
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_prescription_document();
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_event_type;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_event_type CHECK (event_type IN (
 'ACCOUNTS_BOOTSTRAPPED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGOUT','ACCOUNT_DISABLED','LOGIN_THROTTLED','SESSION_REVOKED',
 'PATIENT_CREATED','PATIENT_ADMIN_UPDATED','PATIENT_MEDICAL_UPDATED','PATIENT_ARCHIVED','PATIENT_RESTORED',
 'APPOINTMENT_CREATED','APPOINTMENT_UPDATED','APPOINTMENT_RESCHEDULED','APPOINTMENT_STATUS_CHANGED','APPOINTMENT_CANCELLED',
 'CONSULTATION_CREATED','CONSULTATION_DRAFT_UPDATED','CONSULTATION_TREATMENT_CHANGED','CONSULTATION_FINALIZED',
 'PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED'));
ALTER TABLE security_audit_event DROP CONSTRAINT security_audit_prescription_target;
ALTER TABLE security_audit_event ADD CONSTRAINT security_audit_prescription_target CHECK (
 (event_type IN ('PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED')
 AND target_prescription_id IS NOT NULL AND actor_user_id IS NOT NULL AND subject_user_id IS NULL
 AND target_patient_id IS NULL AND target_appointment_id IS NULL AND target_consultation_id IS NULL)
 OR (event_type NOT IN ('PRESCRIPTION_CREATED','PRESCRIPTION_DRAFT_UPDATED','PRESCRIPTION_ARCHIVED','PRESCRIPTION_FINALIZED') AND target_prescription_id IS NULL));
