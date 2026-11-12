package ma.sijilmassa.invoice;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import ma.sijilmassa.audit.AuditEventType;
import ma.sijilmassa.audit.SecurityAudit;
import ma.sijilmassa.security.AccountPrincipal;
import ma.sijilmassa.security.RolePolicies;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static ma.sijilmassa.finance.FinancialModels.MAX_MINOR;
import static ma.sijilmassa.invoice.InvoiceFailure.Reason.*;
import static ma.sijilmassa.invoice.InvoiceModels.*;

@Service
@PreAuthorize(RolePolicies.ADMINISTRATIVE)
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class InvoiceService {
    static final int MAX_LINES = InvoiceDocument.MAX_LINES;
    static final int PAGE_SIZE = 50;
    private final InvoiceRepository invoices;
    private final SecurityAudit audit;
    private final Clock clock;

    InvoiceService(InvoiceRepository invoices, SecurityAudit audit, Clock clock) {
        this.invoices = invoices;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details createDraft(UUID patientId, List<UUID> chargeIds) {
        UUID actor = actor(true);
        activePatient(patientId);
        UUID id = UUID.randomUUID();
        var charges = validateSelection(patientId, id, chargeIds);
        invoices.insertDraft(id, patientId, actor, instant());
        reserve(id, charges);
        audit.recordInvoice(AuditEventType.INVOICE_CREATED, actor, id);
        return details(header(patientId, id, false));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details replaceDraftCharges(UUID patientId, UUID invoiceId, Long expectedVersion, List<UUID> chargeIds) {
        UUID actor = actor(true);
        var current = lockDraft(patientId, invoiceId, expectedVersion);
        var charges = validateSelection(patientId, invoiceId, chargeIds);
        reserve(invoiceId, charges);
        invoices.advanceDraft(invoiceId, nextInstant(current.updatedAt()));
        audit.recordInvoice(AuditEventType.INVOICE_DRAFT_UPDATED, actor, invoiceId);
        return details(header(patientId, invoiceId, false));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED, timeout = 10)
    public Details issue(UUID patientId, UUID invoiceId, Long expectedVersion) {
        UUID actor = actor(true);
        var current = lockDraft(patientId, invoiceId, expectedVersion);
        var charges = invoices.chargeIds(invoiceId);
        if (charges.isEmpty()) throw new InvoiceFailure(EMPTY_DRAFT);
        validateSelection(patientId, invoiceId, charges);
        // The transition trigger captures V9 lines and allocates the number inside this transaction.
        invoices.issue(invoiceId, actor, nextInstant(current.updatedAt()));
        audit.recordInvoice(AuditEventType.INVOICE_ISSUED, actor, invoiceId);
        return details(header(patientId, invoiceId, false));
    }

    public Details get(UUID patientId, UUID invoiceId) {
        actor(false);
        return details(header(patientId, invoiceId, false));
    }

    public InvoiceDocument issuedDocument(UUID patientId, UUID invoiceId) {
        actor(false);
        var header = invoices.documentHeader(patientId, invoiceId).orElseThrow(() -> new InvoiceFailure(NOT_FOUND));
        if (header.lifecycle() != Lifecycle.EMISE) {
            throw new InvoicePdfFailure(InvoicePdfFailure.Code.INVOICE_NOT_ISSUED);
        }
        return new InvoiceDocument(header.number(), header.date(), header.firstName(), header.lastName(), invoices.documentLines(invoiceId));
    }

    public List<HistoryEntry> history(UUID patientId, HistoryCursor cursor) {
        actor(false);
        patientActive(patientId, false);
        return invoices.history(patientId, cursor, PAGE_SIZE + 1);
    }

    public List<EligibleCharge> eligibleCharges(UUID patientId, ChargeCursor cursor) {
        actor(false);
        if (!patientActive(patientId, false)) return List.of();
        return invoices.eligibleCharges(patientId, cursor, PAGE_SIZE + 1);
    }

    private InvoiceRepository.Header lockDraft(UUID patientId, UUID id, Long expectedVersion) {
        if (expectedVersion == null || expectedVersion < 0 || expectedVersion > MAX_MINOR) throw new InvoiceFailure(INVALID_VERSION);
        activePatient(patientId);
        var header = header(patientId, id, true);
        if (header.lifecycle() != Lifecycle.BROUILLON) throw new InvoiceFailure(INVOICE_ISSUED);
        if (header.version() != expectedVersion || header.version() == MAX_MINOR) throw new InvoiceFailure(VERSION_CONFLICT);
        return header;
    }

    private InvoiceRepository.Header header(UUID patientId, UUID invoiceId, boolean lock) {
        if (patientId == null || invoiceId == null) throw new InvoiceFailure(INVALID_SELECTION);
        return invoices.header(patientId, invoiceId, lock).orElseThrow(() -> new InvoiceFailure(NOT_FOUND));
    }

    private void activePatient(UUID patientId) {
        if (!patientActive(patientId, true)) throw new InvoiceFailure(ARCHIVED_PATIENT);
    }

    private boolean patientActive(UUID patientId, boolean lock) {
        if (patientId == null) throw new InvoiceFailure(INVALID_SELECTION);
        return invoices.patientActive(patientId, lock).orElseThrow(() -> new InvoiceFailure(NOT_FOUND));
    }

    private List<UUID> validateSelection(UUID patientId, UUID invoiceId, List<UUID> input) {
        if (input == null || input.size() > MAX_LINES || input.stream().anyMatch(Objects::isNull)
                || new HashSet<>(input).size() != input.size()) throw new InvoiceFailure(INVALID_SELECTION);
        var charges = List.copyOf(input);
        var candidates = invoices.candidates(patientId, charges);
        if (candidates.size() != charges.size()) throw new InvoiceFailure(CHARGE_NOT_FOUND);
        if (candidates.stream().anyMatch(line -> line.reservedBy() != null && !line.reservedBy().equals(invoiceId))) {
            throw new InvoiceFailure(CHARGE_RESERVED);
        }
        return charges;
    }

    private void reserve(UUID invoiceId, List<UUID> charges) {
        try {
            invoices.replaceLines(invoiceId, charges);
        } catch (DuplicateKeyException exception) {
            throw new InvoiceFailure(CHARGE_RESERVED);
        }
    }

    private Details details(InvoiceRepository.Header header) {
        var lines = invoices.lines(header.id());
        BigInteger price = BigInteger.ZERO;
        BigInteger received = BigInteger.ZERO;
        BigInteger receivedAtIssue = BigInteger.ZERO;
        for (var line : lines) {
            price = price.add(BigInteger.valueOf(line.priceMinor()));
            received = received.add(BigInteger.valueOf(line.currentReceivedMinor()));
            if (line.receivedAtIssueMinor() != null) receivedAtIssue = receivedAtIssue.add(BigInteger.valueOf(line.receivedAtIssueMinor()));
        }
        Balance current = new Balance(price, received, price.subtract(received));
        Issuance issuance = null;
        if (header.lifecycle() == Lifecycle.EMISE) {
            issuance = new Issuance(header.number(), header.issuedDate(), header.issuedAt(), header.issuedBy(),
                    new Balance(price, receivedAtIssue, price.subtract(receivedAtIssue)));
        }
        return new Details(header.id(), header.patientId(), header.lifecycle(), header.version(), header.patient(), "MAD",
                header.createdAt(), header.updatedAt(), lines, current, settlement(header.lifecycle(), current), issuance);
    }

    private UUID actor(boolean lock) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AccountPrincipal principal)
                || !invoices.currentAccount(principal, lock)) throw new AccessDeniedException("Accès refusé.");
        return principal.id();
    }

    private Instant instant() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }

    private Instant nextInstant(Instant previous) {
        var now = instant();
        return now.isAfter(previous) ? now : previous.plus(1, ChronoUnit.MICROS);
    }
}
