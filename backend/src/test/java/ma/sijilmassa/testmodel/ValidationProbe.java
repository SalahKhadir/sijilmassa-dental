package ma.sijilmassa.testmodel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Test-only mapping: exercises real Hibernate validation without a domain table. */
@Entity
@Table(name = "validation_probe")
public class ValidationProbe {
    @Id
    private Long id;

    @Column(nullable = false)
    private String marker;
}
