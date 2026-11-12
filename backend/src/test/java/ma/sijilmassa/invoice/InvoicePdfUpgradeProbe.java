package ma.sijilmassa.invoice;

import java.util.UUID;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.jdbc.core.JdbcTemplate;

/** Exercises the production projection and renderer on the migrated V10 fixture. */
public final class InvoicePdfUpgradeProbe {
    private InvoicePdfUpgradeProbe() { }

    public static String render(JdbcTemplate jdbc, UUID patientId, UUID invoiceId) throws Exception {
        var repository = new InvoiceRepository(jdbc);
        var header = repository.documentHeader(patientId, invoiceId).orElseThrow();
        var invoice = new InvoiceDocument(header.number(), header.date(), header.firstName(), header.lastName(),
                repository.documentLines(invoiceId));
        try (var pdf = Loader.loadPDF(new InvoicePdfRenderer().render(invoice))) {
            return new PDFTextStripper().getText(pdf);
        }
    }
}
