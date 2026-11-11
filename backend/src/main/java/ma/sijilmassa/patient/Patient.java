package ma.sijilmassa.patient;

import java.time.Instant;
import java.time.LocalDate;
import java.text.Normalizer;
import java.util.Locale;
import java.util.UUID;
import jakarta.persistence.*;
import static ma.sijilmassa.patient.PatientValues.*;
import ma.sijilmassa.patient.PatientDtos.*;

@Entity
@Table(name = "patient")
public class Patient {
    @Id UUID id;
    @Version @Column(nullable = false) Long version;
    @Column(nullable = false, length = 24, updatable = false) String reference;
    @Column(name = "first_name", nullable = false, length = 80) String firstName;
    @Column(name = "last_name", nullable = false, length = 80) String lastName;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Sex sex;
    @Column(name = "date_of_birth") LocalDate dateOfBirth;
    @Column(nullable = false, length = 300) String address;
    @Column(nullable = false, length = 40) String gsm;
    @Column(nullable = false, length = 40) String landline;
    @Column(nullable = false, length = 120) String profession;
    @Column(nullable = false, length = 30) String cin;
    @Column(name = "medical_coverage", nullable = false, length = 120) String medicalCoverage;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) Status status;
    @Column(name = "search_name", nullable = false, columnDefinition = "text") String searchName;
    @Column(name = "gsm_digits", nullable = false, length = 20) String gsmDigits;
    @Column(name = "landline_digits", nullable = false, length = 20) String landlineDigits;
    @Column(name = "created_at", nullable = false, updatable = false) Instant createdAt;
    @Column(name = "updated_at", nullable = false) Instant updatedAt;

    protected Patient() { }
    Patient(String reference, AdministrativeCreate input, Instant now) {
        id = UUID.randomUUID(); this.reference = reference; createdAt = now;
        update(input.identity(), input.status(), now);
    }
    void update(Identity input, Status status, Instant now) {
        firstName = input.firstName(); lastName = input.lastName(); sex = input.sex(); dateOfBirth = input.dateOfBirth();
        address = input.address(); gsm = input.gsm(); landline = input.landline(); profession = input.profession();
        cin = input.cin(); medicalCoverage = input.medicalCoverage(); this.status = status;
        searchName = normalize(firstName + " " + lastName);
        gsmDigits = gsm.replaceAll("[^0-9]", ""); landlineDigits = landline.replaceAll("[^0-9]", "");
        updatedAt = updatedAt == null || now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
    }
    public boolean isActive() { return status == Status.ACTIVE; }

    static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).strip().replaceAll("(?U)\\s+", " ");
    }
    AdministrativeDetails details() {
        return new AdministrativeDetails(id, reference, new Identity(firstName, lastName, sex, dateOfBirth,
                address, gsm, landline, profession, cin, medicalCoverage), status, createdAt, updatedAt, version);
    }
    DirectoryEntry directoryEntry() {
        return new DirectoryEntry(id, reference, new DirectoryIdentity(firstName,lastName,sex,dateOfBirth,gsm,landline),
                status, createdAt, version);
    }
}
