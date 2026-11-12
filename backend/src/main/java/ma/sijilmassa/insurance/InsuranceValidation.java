package ma.sijilmassa.insurance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.insurance.InsuranceFailure.Reason.*;
import static ma.sijilmassa.insurance.InsuranceModels.*;

final class InsuranceValidation {
    static final int TEMPLATE_VERSION = 1;

    private InsuranceValidation() { }

    static void template(CreateInput input) {
        if (input == null || input.patientId() == null || input.purpose() == null) throw invalid();
        if (input.documentType() == null || input.templateVersion() != TEMPLATE_VERSION) {
            throw new InsuranceFailure(UNSUPPORTED_TEMPLATE);
        }
        boolean farPurpose = input.purpose() == Purpose.DEVIS || input.purpose() == Purpose.RECUS;
        if (farPurpose != (input.documentType() == DocumentType.FAR_DENTAIRE)) throw invalid();
    }

    static long version(Long input) {
        if (input == null || input < 0 || input > MAX_MINOR) throw invalid();
        return input;
    }

    static DraftInput draft(DocumentType type, Purpose purpose, DraftInput input) {
        if (input == null || input.fields() == null) throw invalid();
        Fields fields = input.fields();
        if ((fields.cnss() != null) != (type == DocumentType.CNSS_DENTAIRE)
                || (fields.cnops() != null) != (type == DocumentType.CNOPS_DENTAIRE)
                || (fields.far() != null) != (type == DocumentType.FAR_DENTAIRE)) throw invalid();
        var normalized = new Fields(insured(type, fields.insured()), count(fields.attachmentCount()),
                cnss(fields.cnss()), cnops(fields.cnops()), far(fields.far()));
        List<ActInput> acts = list(input.acts(), type.maxActs());
        var sources = new HashSet<>();
        return new DraftInput(normalized, acts.stream().map(act -> {
            if (act.treatmentId() != null && !sources.add(act.treatmentId())) throw invalid();
            return act(type, purpose, act);
        }).toList());
    }

    private static InsuredInput insured(DocumentType type, InsuredInput input) {
        if (input == null) return null;
        var value = new InsuredInput(input.relationship(), text(input.firstName(), 100), text(input.lastName(), 100),
                text(input.cin(), 30), text(input.address(), 300), text(input.phone(), 50));
        if (value.relationship() == Relationship.LUI_MEME && (value.firstName() != null || value.lastName() != null
                || value.cin() != null || value.address() != null || value.phone() != null)) throw invalid();
        if (type == DocumentType.CNSS_DENTAIRE && value.phone() != null) throw invalid();
        return value;
    }

    private static CnssFields cnss(CnssFields input) {
        if (input == null) return null;
        return new CnssFields(text(input.registrationNumber(), 50), practitionerNumber(input.practitionerInp()),
                distinct(input.careTypes(), 4, Function.identity()), text(input.priorAuthorizationNumber(), 50),
                date(input.accidentDate()), teeth(input.confirmedTeeth()), declaration(input.dentistDeclaration()));
    }

    private static CnopsFields cnops(CnopsFields input) {
        if (input == null) return null;
        String category = text(input.diagnosisCategory(), 3);
        if (category != null && !category.matches("[A-Z][0-9]{2}")) throw invalid();
        return new CnopsFields(text(input.registrationNumber(), 50), text(input.affiliationNumber(), 50),
                practitionerNumber(input.practitionerInpe()), distinct(input.careTypes(), 4, Function.identity()),
                text(input.priorAuthorizationNumber(), 50), date(input.accidentDate()), text(input.accidentCauses(), 250),
                category, teeth(input.confirmedTeeth()), declaration(input.dentistDeclaration()));
    }

    private static FarFields far(FarFields input) {
        if (input == null) return null;
        var marks = list(input.marks(), 52).stream().map(mark -> new FarMark(tooth(mark.tooth()), mark.symbol())).toList();
        return new FarFields(text(input.accountNumber(), 50), text(input.rank(), 100), text(input.unit(), 100),
                practitionerNumber(input.practitionerInpe()), input.care(), input.context(), count(input.prospectusCount()),
                date(input.insuredStatementDate()), distinct(marks, 52, FarMark::tooth));
    }

    private static DentistDeclaration declaration(DentistDeclaration input) {
        return input == null ? null : new DentistDeclaration(text(input.place(), 100), date(input.date()));
    }

    private static ActInput act(DocumentType type, Purpose purpose, ActInput input) {
        if (input.fields() == null || (input.chargeId() != null && input.treatmentId() == null)) throw invalid();
        var fields = input.fields();
        var value = new ActFields(date(fields.plannedDate()), text(fields.plannedDescription(), 1000),
                text(fields.plannedTooth(), 50), text(fields.actCode(), 50), text(fields.keyLetter(), 10),
                coefficient(fields.coefficient()), minor(fields.keyValueMinor()), minor(fields.quotedFeeMinor()));
        if (purpose.executed()) {
            if (value.plannedDate() != null || value.plannedDescription() != null || value.plannedTooth() != null
                    || value.quotedFeeMinor() != null) throw invalid();
        } else if (input.treatmentId() != null || input.chargeId() != null) {
            throw invalid();
        }
        if (type == DocumentType.FAR_DENTAIRE && (value.actCode() != null || value.keyLetter() != null
                || value.keyValueMinor() != null)) throw invalid();
        return new ActInput(input.treatmentId(), input.chargeId(), value);
    }

    static void complete(DocumentType type, DraftInput draft, Insured insured, Beneficiary beneficiary) {
        if (draft.acts().isEmpty()) throw incomplete();
        require(insured.firstName(), insured.lastName(), beneficiary.firstName(), beneficiary.lastName());
        switch (type) {
            case CNSS_DENTAIRE -> require(draft.fields().cnss().registrationNumber(), draft.fields().cnss().practitionerInp());
            case CNOPS_DENTAIRE -> require(draft.fields().cnops().registrationNumber(), draft.fields().cnops().affiliationNumber(),
                    draft.fields().cnops().practitionerInpe());
            case FAR_DENTAIRE -> {
                var far = draft.fields().far();
                if (far.marks().stream().anyMatch(mark -> mark.symbol() == null)) throw incomplete();
                require(far.accountNumber(), far.rank(), far.unit(), far.practitionerInpe(), far.care(), far.context(),
                        far.prospectusCount(), draft.fields().attachmentCount(), far.insuredStatementDate(),
                        insured.cin(), insured.address(), insured.phone(), beneficiary.dateOfBirth());
            }
        }
    }

    static void require(Object... values) {
        for (Object value : values) if (value == null || (value instanceof String text && text.isBlank())) throw incomplete();
    }

    private static String practitionerNumber(String input) {
        String number = text(input, 9);
        if (number != null && !number.matches("[0-9]{9}")) throw invalid();
        return number;
    }

    private static String text(String input, int limit) {
        if (input == null) return null;
        if (input.codePoints().anyMatch(Character::isISOControl)) throw invalid();
        String value = input.strip();
        if (value.length() > limit) throw invalid();
        return value.isEmpty() ? null : value;
    }

    private static LocalDate date(LocalDate value) {
        if (value != null && (value.getYear() < 1 || value.getYear() > 9999)) throw invalid();
        return value;
    }

    private static Integer count(Integer value) {
        if (value != null && (value < 0 || value > 9999)) throw invalid();
        return value;
    }

    private static Long minor(Long value) {
        if (value != null && (value < 0 || value > MAX_MINOR)) throw invalid();
        return value;
    }

    private static BigDecimal coefficient(BigDecimal value) {
        if (value != null && (value.scale() < 0 || value.scale() > 4 || value.signum() < 0
                || value.compareTo(BigDecimal.valueOf(999999)) > 0)) throw invalid();
        return value;
    }

    private static String tooth(String value) {
        if (value == null || !value.matches("(?:[1-4][1-8]|[5-8][1-5])")) throw invalid();
        return value;
    }

    private static List<String> teeth(List<String> input) {
        return distinct(list(input, 52).stream().map(InsuranceValidation::tooth).toList(), 52, Function.identity());
    }

    private static <T> List<T> list(List<T> input, int limit) {
        if (input == null) return List.of();
        if (input.size() > limit || input.stream().anyMatch(Objects::isNull)) throw invalid();
        return List.copyOf(input);
    }

    private static <T> List<T> distinct(List<T> input, int limit, Function<T, ?> key) {
        var result = list(input, limit);
        var keys = new HashSet<>();
        if (result.stream().anyMatch(item -> !keys.add(key.apply(item)))) throw invalid();
        return result;
    }

    private static InsuranceFailure invalid() { return new InsuranceFailure(INVALID_INPUT); }
    private static InsuranceFailure incomplete() { return new InsuranceFailure(INCOMPLETE_DOCUMENT); }
}
