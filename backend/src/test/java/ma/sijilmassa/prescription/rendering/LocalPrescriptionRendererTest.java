package ma.sijilmassa.prescription.rendering;

import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import static org.assertj.core.api.Assertions.*;
import static ma.sijilmassa.prescription.rendering.RenderingFailure.Code.*;

class LocalPrescriptionRendererTest {
    @TempDir Path temp;
    static void failure(Runnable work, RenderingFailure.Code code) {
        assertThatThrownBy(work::run).isInstanceOfSatisfying(RenderingFailure.class, e -> {
            assertThat(e.code()).isEqualTo(code); assertThat(e.getMessage()).doesNotContain("SECRET", "Émeraude", "Synthétique", "node_modules");
            assertThat(e.getCause()).isNull();
        });
    }
    @Test void realWorkerReturnsAnIndependentlyParsedA5WithCorrectFieldMapping() throws Exception {
        var renderer = RenderingFixtures.renderer(RenderingFixtures.config());
        try {
            var request = RenderingFixtures.request(); var result = renderer.render(request);
            try (var pdf = Loader.loadPDF(result.bytes())) {
                assertThat(pdf.getNumberOfPages()).isEqualTo(1);
                var text = new PDFTextStripper().getText(pdf);
                assertThat(text).contains("Patient Synthétique", "Émeraude", "BROUILLON", "10/11/2026");
            }
            assertThat(result.sha256()).isEqualTo(LocalPrescriptionRenderer.digest(result.bytes()));
            var copy = result.bytes(); copy[0] = 0; assertThat(result.bytes()[0]).isEqualTo((byte) '%');
            assertThat(result.toString()).doesNotContain("Émeraude");
        } finally { renderer.close(); }
    }
    @Test void workerAndAssetsProduceDeterministicBytesForIdenticalData() throws Exception {
        var renderer = RenderingFixtures.renderer(RenderingFixtures.config());
        try { var request = RenderingFixtures.request(); assertThat(renderer.render(request).bytes()).isEqualTo(renderer.render(request).bytes()); }
        finally { renderer.close(); }
    }
    @Test void unsupportedCharactersAndOverflowHaveSafeTypedErrors() throws Exception {
        var renderer = RenderingFixtures.renderer(RenderingFixtures.config());
        try {
            var q = RenderingFixtures.request();
            for (var entry : Map.of("دواء", UNSUPPORTED_CHARACTER, "🦷", UNSUPPORTED_CHARACTER,
                    "Instruction synthétique. ".repeat(60), LAYOUT_OVERFLOW).entrySet()) {
                var r = q.record(); var changed = new RenderingRequest(1, q.requestId(), q.mode(), new RenderingRequest.Record(r.id(), r.patientId(), r.consultationId(), r.version(), r.issuedDate(), r.medications(), entry.getKey(), r.createdAt(), r.updatedAt()), q.patient());
                failure(() -> renderer.render(changed), entry.getValue());
            }
        } finally { renderer.close(); }
    }
    @Test void unavailableAndDisabledConfigurationFailClosed() throws Exception {
        var config = RenderingFixtures.config(); config.setEnabled(false);
        var renderer = RenderingFixtures.renderer(config); var disabled = renderer;
        failure(() -> disabled.render(RenderingFixtures.request()), UNAVAILABLE); renderer.close();
        config.setEnabled(true); config.setNodeExecutable(temp.resolve("missing-node"));
        renderer = RenderingFixtures.renderer(config); var missing = renderer;
        failure(() -> missing.render(RenderingFixtures.request()), UNAVAILABLE); renderer.close();
    }
    @Test void configurablePdfLimitAndInputLimitAreEnforced() throws Exception {
        var config = RenderingFixtures.config(); config.setMaxPdfBytes(10);
        var small = RenderingFixtures.renderer(config); failure(() -> small.render(RenderingFixtures.request()), PDF_TOO_LARGE); small.close();
        var renderer = RenderingFixtures.renderer(RenderingFixtures.config()); var q = RenderingFixtures.request(); var r = q.record();
        var large = new RenderingRequest(1, q.requestId(), q.mode(), new RenderingRequest.Record(r.id(), r.patientId(), r.consultationId(), r.version(), r.issuedDate(), r.medications(), "x".repeat(1024 * 1024), r.createdAt(), r.updatedAt()), q.patient());
        failure(() -> renderer.render(large), INVALID_INPUT); renderer.close();
    }
    @Test void wrongManifestAndUnlistedRuntimeCodeAreRejectedBeforeExecuting() throws Exception {
        var config = RenderingFixtures.config(); config.setManifestSha256("0".repeat(64));
        var first = RenderingFixtures.renderer(config); failure(() -> first.render(RenderingFixtures.request()), UNTRUSTED_WORKER); first.close();
        var root = RenderingFixtures.fake(temp, "process.exit(99)"); config = RenderingFixtures.config(root);
        Files.writeString(root.resolve("unexpected.js"), "throw new Error('SECRET')");
        var second = RenderingFixtures.renderer(config); failure(() -> second.render(RenderingFixtures.request()), UNTRUSTED_WORKER); second.close();
    }
    @Test void tamperedWorkerCodeIsRejectedEvenWithAnUnchangedManifest() throws Exception {
        var root = RenderingFixtures.fake(temp, "process.exit(0)"); var config = RenderingFixtures.config(root);
        Files.writeString(root.resolve(LocalPrescriptionRenderer.WORKER), "process.stdout.write('SECRET')");
        var renderer = RenderingFixtures.renderer(config); failure(() -> renderer.render(RenderingFixtures.request()), UNTRUSTED_WORKER); renderer.close();
    }
    @Test void malformedResponsesCannotLeakWorkerStdoutOrStderr() throws Exception {
        for (String body : List.of("process.stderr.write('SECRET');process.stdout.write('SECRET')",
                "process.stdout.write(JSON.stringify({protocolVersion:1,requestId:q.requestId,ok:true}))",
                "process.stdout.write(JSON.stringify({protocolVersion:1,requestId:'wrong',ok:false,code:'SECRET'}))")) {
            var renderer = RenderingFixtures.renderer(RenderingFixtures.config(RenderingFixtures.fake(temp, body)));
            failure(() -> renderer.render(RenderingFixtures.request()), INVALID_OUTPUT); renderer.close();
        }
    }
    @Test void bogusPdfWithValidResponseHashesStillFailsIndependentParsing() throws Exception {
        String body = "const b=Buffer.from('%PDF-1.4\\nSECRET fake document\\n%%EOF');const c=require('node:crypto');process.stdout.write(JSON.stringify({protocolVersion:1,requestId:q.requestId,ok:true,pdfBase64:b.toString('base64'),pdfBytes:b.length,sha256:c.createHash('sha256').update(b).digest('hex'),templateSha256:'" + LocalPrescriptionRenderer.TEMPLATE + "',fontSha256:'" + LocalPrescriptionRenderer.FONT + "',rendererId:'prescription-a5-v1'}))";
        var renderer = RenderingFixtures.renderer(RenderingFixtures.config(RenderingFixtures.fake(temp, body)));
        failure(() -> renderer.render(RenderingFixtures.request()), INVALID_OUTPUT); renderer.close();
    }
    @Test void outputFloodAndEmptyOutputAreRejectedAndProcessesAreCleanedUp() throws Exception {
        for (String body : List.of("process.stdout.write('x'.repeat(4*1024*1024))", "process.stdout.end()")) {
            var renderer = RenderingFixtures.renderer(RenderingFixtures.config(RenderingFixtures.fake(temp, body)));
            failure(() -> renderer.render(RenderingFixtures.request()), INVALID_OUTPUT); renderer.close();
        }
    }
    @Test void timeoutIsBoundedAndDoesNotLeaveTheWorkerRunning() throws Exception {
        var root = RenderingFixtures.fake(temp, "setInterval(()=>{},1000)"); var config = RenderingFixtures.config(root); config.setTimeout(Duration.ofMillis(300));
        var renderer = RenderingFixtures.renderer(config); long start = System.nanoTime();
        failure(() -> renderer.render(RenderingFixtures.request()), TIMEOUT); renderer.close();
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(3));
        assertThat(ProcessHandle.current().descendants().filter(p -> p.info().commandLine().orElse("").contains(root.toString())).toList()).isEmpty();
    }
    @Test void capacityIsOneAndShutdownKillsTheActiveWorker() throws Exception {
        var root = RenderingFixtures.fake(temp, "setInterval(()=>{},1000)"); var config = RenderingFixtures.config(root);
        var renderer = RenderingFixtures.renderer(config);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var first = executor.submit(() -> renderer.render(RenderingFixtures.request()));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (ProcessHandle.current().descendants().noneMatch(p -> p.info().commandLine().orElse("").contains(root.toString()))) {
                if (System.nanoTime() > deadline) fail("Worker did not start"); Thread.sleep(5);
            }
            failure(() -> renderer.render(RenderingFixtures.request()), BUSY);
            renderer.close(); assertThatThrownBy(() -> first.get(2, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
            failure(() -> renderer.render(RenderingFixtures.request()), UNAVAILABLE);
        } finally { renderer.close(); }
    }
}
