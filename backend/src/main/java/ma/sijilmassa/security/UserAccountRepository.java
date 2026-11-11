package ma.sijilmassa.security;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select u from UserAccount u where u.id = :id")
    Optional<UserAccount> lockForPrescriptionFinalization(UUID id);

    Optional<UserAccount> findByUsername(String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.username = :username")
    Optional<UserAccount> findForLogin(String username);
}
