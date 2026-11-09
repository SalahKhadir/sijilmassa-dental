package ma.sijilmassa.patient;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import jakarta.persistence.*;
import static ma.sijilmassa.patient.PatientValues.*;
import ma.sijilmassa.patient.PatientDtos.*;

@Entity
@Table(name = "patient_medical_record")
public class PatientMedicalRecord {
    @Id @Column(name = "patient_id") UUID patientId;
    @Version @Column(nullable = false) Long version;
    @Column(name = "questionnaire_version", nullable = false) int questionnaireVersion;
    @Enumerated(EnumType.STRING) @Column(name = "history_report_status", nullable = false, length = 16) ReportStatus historyStatus;
    @Column(name = "history_other_details", nullable = false, length = 1000) String otherDetails;
    @Enumerated(EnumType.STRING) @Column(name = "allergy_report_status", nullable = false, length = 16) ReportStatus allergyStatus;
    @Column(name = "allergy_clarification", nullable = false, length = 1000) String clarification;
    @Enumerated(EnumType.STRING) @Column(name = "under_medical_treatment", nullable = false, length = 16) Answer underMedicalTreatment;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Answer pregnant;
    @Column(name = "additional_information", nullable = false, length = 2000) String additionalInformation;
    @Column(name = "reason_for_consultation", nullable = false, length = 2000) String reasonForConsultation;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;
    @ElementCollection
    @CollectionTable(name = "patient_history_condition", joinColumns = @JoinColumn(name = "patient_id"))
    @Enumerated(EnumType.STRING) @Column(name = "condition_code", nullable = false, length = 32)
    Set<Condition> conditions = new HashSet<>();
    @ElementCollection
    @CollectionTable(name = "patient_allergy_category", joinColumns = @JoinColumn(name = "patient_id"))
    @Enumerated(EnumType.STRING) @Column(name = "category_code", nullable = false, length = 32)
    Set<Allergy> allergies = new HashSet<>();

    protected PatientMedicalRecord() { }
    PatientMedicalRecord(UUID patientId, MedicalContent input, Instant now) {
        this.patientId = patientId; createdAt = now; update(input, now);
    }
    void update(MedicalContent input, Instant now) {
        questionnaireVersion = input.questionnaireVersion(); historyStatus = input.medicalHistory().reportStatus();
        otherDetails = input.medicalHistory().otherDetails(); allergyStatus = input.allergies().reportStatus();
        clarification = input.allergies().clarification(); underMedicalTreatment = input.healthQuestionnaire().underMedicalTreatment();
        pregnant = input.healthQuestionnaire().pregnant(); additionalInformation = input.healthQuestionnaire().additionalInformation();
        reasonForConsultation = input.healthQuestionnaire().reasonForConsultation();
        conditions.clear(); conditions.addAll(input.medicalHistory().conditions());
        allergies.clear(); allergies.addAll(input.allergies().categories()); updatedAt = updatedAt == null || now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
    }
    MedicalDetails details() {
        return new MedicalDetails(patientId, version, createdAt, updatedAt,
                new MedicalContent(questionnaireVersion,
                        new MedicalHistory(historyStatus, conditions.stream().sorted().toList(), otherDetails),
                        new Allergies(allergyStatus, allergies.stream().sorted().toList(), clarification),
                        new Questionnaire(underMedicalTreatment, pregnant, additionalInformation, reasonForConsultation)));
    }
}
