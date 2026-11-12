package ma.sijilmassa.insurance;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class InsuranceModels {
    private InsuranceModels() { }

    private static <T> List<T> detachedList(List<T> items) {
        return items == null ? null : Collections.unmodifiableList(new ArrayList<>(items));
    }

    public enum DocumentType {
        CNSS_DENTAIRE(3, "9f829b1a26545a979e5cc94075307822aac95295529d572bfee17a82e5d51609"),
        CNOPS_DENTAIRE(9, "255e712e12aa0642c79ee6789e8e03c587425c6d4186f58e8fe094985b45efef"),
        FAR_DENTAIRE(5, "35278aba6d61ce76d8ac30e3ffba5c2f2f2d95cd5d60fabea3921bb55a239d43");

        private final int maxActs;
        private final String templateSha256;

        DocumentType(int maxActs, String templateSha256) {
            this.maxActs = maxActs;
            this.templateSha256 = templateSha256;
        }

        public int maxActs() { return maxActs; }
        public String templateSha256() { return templateSha256; }
    }

    public enum Purpose {
        EXECUTION, ENTENTE_PREALABLE, DEVIS, RECUS;

        boolean executed() { return this == EXECUTION || this == RECUS; }
    }

    public enum Lifecycle { BROUILLON, FINALISE }
    public enum Relationship { LUI_MEME, CONJOINT, ENFANT }
    public enum CnssCare { SOINS, PROTHESE, ORTHODONTIE_FACIALE, AUTRES }
    public enum CnopsCare { SOINS, PROTHESE, ORTHODONTIE_ODF, AUTRES }
    public enum FarCare { SOINS, PROTHESE }
    public enum FarContext { MALADIE, MATERNITE, ACCIDENT }
    public enum FarSymbol { CERCLE, CROIX }
    public enum FeeSource { V9_AGREED_PRICE, MANUAL_QUOTE }
    public enum InsuredSource { PATIENT, DOCUMENT_INPUT }

    public record InsuredInput(Relationship relationship, String firstName, String lastName, String cin,
            String address, String phone) {
        @Override public String toString() { return "Insured input [withheld]"; }
    }
    public record DentistDeclaration(String place, LocalDate date) { }
    public record CnssFields(String registrationNumber, String practitionerInp, List<CnssCare> careTypes,
            String priorAuthorizationNumber, LocalDate accidentDate, List<String> confirmedTeeth,
            DentistDeclaration dentistDeclaration) {
        public CnssFields {
            careTypes = detachedList(careTypes);
            confirmedTeeth = detachedList(confirmedTeeth);
        }
        @Override public String toString() { return "CNSS fields [withheld]"; }
    }
    public record CnopsFields(String registrationNumber, String affiliationNumber, String practitionerInpe,
            List<CnopsCare> careTypes, String priorAuthorizationNumber, LocalDate accidentDate,
            String accidentCauses, String diagnosisCategory, List<String> confirmedTeeth,
            DentistDeclaration dentistDeclaration) {
        public CnopsFields {
            careTypes = detachedList(careTypes);
            confirmedTeeth = detachedList(confirmedTeeth);
        }
        @Override public String toString() { return "CNOPS fields [withheld]"; }
    }
    public record FarMark(String tooth, FarSymbol symbol) { }
    public record FarFields(String accountNumber, String rank, String unit, String practitionerInpe, FarCare care,
            FarContext context, Integer prospectusCount, LocalDate insuredStatementDate, List<FarMark> marks) {
        public FarFields { marks = detachedList(marks); }
        @Override public String toString() { return "FAR fields [withheld]"; }
    }
    public record Fields(InsuredInput insured, Integer attachmentCount, CnssFields cnss, CnopsFields cnops, FarFields far) {
        @Override public String toString() { return "Insurance fields [withheld]"; }
    }
    public record ActFields(LocalDate plannedDate, String plannedDescription, String plannedTooth, String actCode,
            String keyLetter, BigDecimal coefficient, Long keyValueMinor, Long quotedFeeMinor) {
        @Override public String toString() { return "Insurance act fields [withheld]"; }
    }
    public record ActInput(UUID treatmentId, UUID chargeId, ActFields fields) { }

    public record DraftInput(Fields fields, List<ActInput> acts) {
        public DraftInput { acts = detachedList(acts); }
        @Override public String toString() { return "Insurance draft [withheld]"; }
    }
    public record CreateInput(UUID patientId, UUID consultationId, DocumentType documentType, int templateVersion,
            Purpose purpose, DraftInput draft) { }
    public record FinalizeInput(Long expectedVersion, Long expectedPatientVersion, Long expectedConsultationVersion) { }
    public record HistoryCursor(Instant createdAt, UUID documentId) { }
    public record HistoryEntry(UUID id, UUID consultationId, DocumentType documentType, int templateVersion,
            Lifecycle lifecycle, Instant createdAt, Instant finalizedAt) { }
    public record Beneficiary(UUID patientId, long version, String firstName, String lastName, String cin,
            LocalDate dateOfBirth, String sex) {
        @Override public String toString() { return "Insurance beneficiary [withheld]"; }
    }
    public record ConsultationSource(UUID consultationId, long version, LocalDate date, boolean finalized) { }
    public record Insured(Relationship relationship, InsuredSource source, String firstName, String lastName, String cin,
            String address, String phone) {
        @Override public String toString() { return "Confirmed insured [withheld]"; }
    }
    public record ConfirmedAct(UUID treatmentId, UUID chargeId, LocalDate date, String description, String tooth,
            String actCode, String keyLetter, BigDecimal coefficient, Long keyValueMinor, FeeSource feeSource, Long feeMinor) {
        @Override public String toString() { return "Confirmed insurance act [withheld]"; }
    }
    public record Snapshot(int schemaVersion, DocumentType documentType, int templateVersion, String templateSha256,
            Purpose purpose, Beneficiary beneficiary, ConsultationSource consultation, Insured insured, Fields fields,
            List<ConfirmedAct> acts, BigInteger knownCompleteFeeTotalMinor) {
        public Snapshot { acts = List.copyOf(acts); }
        @Override public String toString() { return "Insurance snapshot [withheld]"; }
    }
    public record Details(UUID id, UUID patientId, UUID consultationId, DocumentType documentType, int templateVersion,
            Purpose purpose, Lifecycle lifecycle, long version, Instant createdAt, Instant updatedAt, UUID createdBy,
            UUID updatedBy, Instant finalizedAt, UUID finalizedBy, Beneficiary beneficiary, ConsultationSource consultation,
            DraftInput draft, Snapshot snapshot) {
        @Override public String toString() { return "Insurance document [withheld]"; }
    }
}
