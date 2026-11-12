package ma.sijilmassa.insurance;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import ma.sijilmassa.patient.PatientDtos.StrictInput;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.insurance.InsuranceDocumentService.PAGE_SIZE;
import static ma.sijilmassa.insurance.InsuranceModels.*;

public final class InsuranceDtos {
    private InsuranceDtos() { }

    public record CreateDraft(@NotNull UUID patientId, UUID consultationId, @NotNull DocumentType documentType,
            @NotNull Integer templateVersion, @NotNull Purpose purpose, @NotNull @Valid Draft draft) implements StrictInput {
        CreateInput command() {
            return new CreateInput(patientId, consultationId, documentType, templateVersion, purpose, draft.command());
        }
    }

    public record EditDraft(@NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedVersion,
            @NotNull @Valid Draft draft) implements StrictInput { }

    public record FinalizeDraft(@NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedVersion,
            @NotNull @PositiveOrZero @Max(MAX_MINOR) Long expectedPatientVersion,
            @PositiveOrZero @Max(MAX_MINOR) Long expectedConsultationVersion) implements StrictInput {
        FinalizeInput command() {
            return new FinalizeInput(expectedVersion, expectedPatientVersion, expectedConsultationVersion);
        }
    }

    public record Draft(@NotNull @Valid FormFields fields,
            @Size(max = 9) List<@NotNull @Valid DraftAct> acts) implements StrictInput {
        DraftInput command() {
            return new DraftInput(fields.command(), acts == null ? null : acts.stream().map(DraftAct::command).toList());
        }
        static Draft from(DraftInput value) {
            return new Draft(FormFields.from(value.fields()), value.acts().stream().map(DraftAct::from).toList());
        }
    }

    public record FormFields(@Valid InsuredFields insured, @PositiveOrZero @Max(9999) Integer attachmentCount,
            @Valid CnssForm cnss, @Valid CnopsForm cnops, @Valid FarForm far) implements StrictInput {
        Fields command() {
            return new Fields(insured == null ? null : insured.command(), attachmentCount,
                    cnss == null ? null : cnss.command(), cnops == null ? null : cnops.command(), far == null ? null : far.command());
        }
        static FormFields from(Fields value) {
            return new FormFields(InsuredFields.from(value.insured()), value.attachmentCount(),
                    CnssForm.from(value.cnss()), CnopsForm.from(value.cnops()), FarForm.from(value.far()));
        }
    }

    public record InsuredFields(Relationship relationship, String firstName, String lastName, String cin,
            String address, String phone) implements StrictInput {
        InsuredInput command() { return new InsuredInput(relationship, firstName, lastName, cin, address, phone); }
        static InsuredFields from(InsuredInput value) {
            return value == null ? null : new InsuredFields(value.relationship(), value.firstName(), value.lastName(),
                    value.cin(), value.address(), value.phone());
        }
    }

    public record Declaration(String place, LocalDate date) implements StrictInput {
        DentistDeclaration command() { return new DentistDeclaration(place, date); }
        static Declaration from(DentistDeclaration value) {
            return value == null ? null : new Declaration(value.place(), value.date());
        }
    }

    public record CnssForm(String registrationNumber, String practitionerInp, @Size(max = 4) List<@NotNull CnssCare> careTypes,
            String priorAuthorizationNumber, LocalDate accidentDate, @Size(max = 52) List<@NotNull String> confirmedTeeth,
            @Valid Declaration dentistDeclaration) implements StrictInput {
        CnssFields command() {
            return new CnssFields(registrationNumber, practitionerInp, careTypes, priorAuthorizationNumber, accidentDate,
                    confirmedTeeth, dentistDeclaration == null ? null : dentistDeclaration.command());
        }
        static CnssForm from(CnssFields value) {
            return value == null ? null : new CnssForm(value.registrationNumber(), value.practitionerInp(), value.careTypes(),
                    value.priorAuthorizationNumber(), value.accidentDate(), value.confirmedTeeth(),
                    Declaration.from(value.dentistDeclaration()));
        }
    }

    public record CnopsForm(String registrationNumber, String affiliationNumber, String practitionerInpe,
            @Size(max = 4) List<@NotNull CnopsCare> careTypes, String priorAuthorizationNumber, LocalDate accidentDate,
            String accidentCauses, String diagnosisCategory, @Size(max = 52) List<@NotNull String> confirmedTeeth,
            @Valid Declaration dentistDeclaration) implements StrictInput {
        CnopsFields command() {
            return new CnopsFields(registrationNumber, affiliationNumber, practitionerInpe, careTypes, priorAuthorizationNumber,
                    accidentDate, accidentCauses, diagnosisCategory, confirmedTeeth,
                    dentistDeclaration == null ? null : dentistDeclaration.command());
        }
        static CnopsForm from(CnopsFields value) {
            return value == null ? null : new CnopsForm(value.registrationNumber(), value.affiliationNumber(),
                    value.practitionerInpe(), value.careTypes(), value.priorAuthorizationNumber(), value.accidentDate(),
                    value.accidentCauses(), value.diagnosisCategory(), value.confirmedTeeth(), Declaration.from(value.dentistDeclaration()));
        }
    }

    public record Mark(@NotNull String tooth, FarSymbol symbol) implements StrictInput {
        FarMark command() { return new FarMark(tooth, symbol); }
        static Mark from(FarMark value) { return new Mark(value.tooth(), value.symbol()); }
    }

    public record FarForm(String accountNumber, String rank, String unit, String practitionerInpe, FarCare care,
            FarContext context, @PositiveOrZero @Max(9999) Integer prospectusCount, LocalDate insuredStatementDate,
            @Size(max = 52) List<@NotNull @Valid Mark> marks) implements StrictInput {
        FarFields command() {
            return new FarFields(accountNumber, rank, unit, practitionerInpe, care, context, prospectusCount,
                    insuredStatementDate, marks == null ? null : marks.stream().map(Mark::command).toList());
        }
        static FarForm from(FarFields value) {
            return value == null ? null : new FarForm(value.accountNumber(), value.rank(), value.unit(), value.practitionerInpe(),
                    value.care(), value.context(), value.prospectusCount(), value.insuredStatementDate(),
                    value.marks().stream().map(Mark::from).toList());
        }
    }

    public record DraftAct(UUID treatmentId, UUID chargeId, @NotNull @Valid ActData fields) implements StrictInput {
        ActInput command() { return new ActInput(treatmentId, chargeId, fields.command()); }
        static DraftAct from(ActInput value) { return new DraftAct(value.treatmentId(), value.chargeId(), ActData.from(value.fields())); }
    }

    public record ActData(LocalDate plannedDate, String plannedDescription, String plannedTooth, String actCode,
            String keyLetter, @Digits(integer = 6, fraction = 4) BigDecimal coefficient,
            @PositiveOrZero @Max(MAX_MINOR) Long keyValueMinor, @PositiveOrZero @Max(MAX_MINOR) Long quotedFeeMinor)
            implements StrictInput {
        ActFields command() {
            return new ActFields(plannedDate, plannedDescription, plannedTooth, actCode, keyLetter, coefficient,
                    keyValueMinor, quotedFeeMinor);
        }
        static ActData from(ActFields value) {
            return new ActData(value.plannedDate(), value.plannedDescription(), value.plannedTooth(), value.actCode(),
                    value.keyLetter(), value.coefficient(), value.keyValueMinor(), value.quotedFeeMinor());
        }
    }

    public record BeneficiaryView(UUID patientId, long version, String firstName, String lastName, String cin,
            LocalDate dateOfBirth, String sex) { }

    public record ConsultationView(UUID consultationId, long version, LocalDate date, boolean finalized) { }

    public record InsuredView(Relationship relationship, InsuredSource source, String firstName, String lastName,
            String cin, String address, String phone) { }

    public record ActView(UUID treatmentId, UUID chargeId, LocalDate date, String description, String tooth,
            String actCode, String keyLetter, BigDecimal coefficient, Long keyValueMinor, FeeSource feeSource, Long feeMinor) { }

    public record FinalizedSnapshot(int schemaVersion, String templateSha256, InsuredView insured, FormFields fields,
            List<ActView> acts, String knownCompleteFeeTotalMinor) { }

    public record Detail(UUID documentId, UUID patientId, UUID consultationId, DocumentType documentType, int templateVersion,
            Purpose purpose, Lifecycle lifecycle, long version, String currency, Instant createdAt, Instant updatedAt,
            Instant finalizedAt, BeneficiaryView beneficiary, ConsultationView consultation, Draft draft, FinalizedSnapshot snapshot) { }

    public record HistoryItem(UUID documentId, UUID consultationId, DocumentType documentType, int templateVersion,
            Lifecycle lifecycle, Instant createdAt, Instant finalizedAt) { }

    public record HistoryNext(Instant afterCreatedAt, UUID afterDocumentId) { }

    public record HistoryPage(List<HistoryItem> items, HistoryNext nextCursor) { }

    static Detail detail(Details value) {
        var patient = value.beneficiary();
        var beneficiary = new BeneficiaryView(patient.patientId(), patient.version(), patient.firstName(), patient.lastName(),
                patient.cin(), patient.dateOfBirth(), patient.sex());
        var source = value.consultation();
        var consultation = source == null ? null : new ConsultationView(source.consultationId(), source.version(), source.date(),
                source.finalized());
        return new Detail(value.id(), value.patientId(), value.consultationId(), value.documentType(), value.templateVersion(),
                value.purpose(), value.lifecycle(), value.version(), "MAD", value.createdAt(), value.updatedAt(), value.finalizedAt(),
                beneficiary, consultation, value.draft() == null ? null : Draft.from(value.draft()), snapshot(value.snapshot()));
    }

    private static FinalizedSnapshot snapshot(Snapshot value) {
        if (value == null) return null;
        var insured = value.insured();
        var holder = new InsuredView(insured.relationship(), insured.source(), insured.firstName(), insured.lastName(),
                insured.cin(), insured.address(), insured.phone());
        var acts = value.acts().stream().map(act -> new ActView(act.treatmentId(), act.chargeId(), act.date(), act.description(),
                act.tooth(), act.actCode(), act.keyLetter(), act.coefficient(), act.keyValueMinor(), act.feeSource(), act.feeMinor())).toList();
        var total = value.knownCompleteFeeTotalMinor();
        return new FinalizedSnapshot(value.schemaVersion(), value.templateSha256(), holder, FormFields.from(value.fields()),
                acts, total == null ? null : total.toString());
    }

    static HistoryPage history(List<HistoryEntry> rows) {
        var items = rows.stream().limit(PAGE_SIZE).map(row -> new HistoryItem(row.id(), row.consultationId(), row.documentType(),
                row.templateVersion(), row.lifecycle(), row.createdAt(), row.finalizedAt())).toList();
        var last = rows.size() > PAGE_SIZE ? rows.get(PAGE_SIZE - 1) : null;
        return new HistoryPage(items, last == null ? null : new HistoryNext(last.createdAt(), last.id()));
    }
}
