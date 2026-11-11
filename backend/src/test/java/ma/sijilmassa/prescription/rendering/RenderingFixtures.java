package ma.sijilmassa.prescription.rendering;

import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import ma.sijilmassa.prescription.*;
import tools.jackson.databind.json.JsonMapper;

final class RenderingFixtures {
    static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();
    static final Path WORKER = Path.of("../frontend/.prescription-renderer").toAbsolutePath().normalize();
    static final Path MODULES = Path.of("../frontend/node_modules").toAbsolutePath().normalize();
    static Path node() {
        for (String part : System.getenv("PATH").split(File.pathSeparator)) {
            Path path = Path.of(part, "node");
            if (Files.isExecutable(path)) try { return path.toRealPath(); } catch (IOException ignored) { }
        }
        throw new IllegalStateException("Node 24 is required for rendering tests");
    }
    static RenderingProperties config() throws IOException { return config(WORKER); }
    static RenderingProperties config(Path worker) throws IOException {
        var p = new RenderingProperties(); p.setEnabled(true); p.setNodeExecutable(node());
        p.setWorkerDirectory(worker); p.setModulesDirectory(MODULES);
        p.setManifestSha256(LocalPrescriptionRenderer.digest(Files.readAllBytes(worker.resolve("manifest.json")))); return p;
    }
    static LocalPrescriptionRenderer renderer(RenderingProperties properties) { return new LocalPrescriptionRenderer(properties, JSON, new PrescriptionPdfValidator()); }
    static PrescriptionDtos.Details details() {
        UUID patient = UUID.randomUUID();
        return new PrescriptionDtos.Details(UUID.randomUUID(), patient, 0, Prescription.Status.BROUILLON,
                new PrescriptionDtos.StoredContent(null, LocalDate.of(2026, 11, 10),
                        List.of(new PrescriptionDtos.Line(UUID.randomUUID(), "Produit fictif Émeraude", "Saisie fictive", "Saisie fictive", "Saisie fictive", "")), ""),
                new PrescriptionDtos.PatientDisplay(patient, "PAT-000001", "Patient", "Synthétique", "Patient Synthétique", 0, "active"),
                Instant.parse("2026-11-10T09:00:00Z"), Instant.parse("2026-11-10T09:01:00Z"), null, null, null);
    }
    static RenderingRequest request() { return RenderingRequest.from(details(), RenderingRequest.Mode.DRAFT); }
    static Path fake(Path parent, String body) throws IOException {
        Path root = Files.createTempDirectory(parent, "worker-");
        Files.createDirectories(root.resolve("server/prescription-renderer")); Files.createDirectories(root.resolve("assets"));
        Files.writeString(root.resolve(LocalPrescriptionRenderer.WORKER), "let data='';process.stdin.on('data',x=>data+=x);process.stdin.on('end',()=>{const q=JSON.parse(data);" + body + "});");
        Files.copy(WORKER.resolve("assets/ordonnance-a5.pdf"), root.resolve("assets/ordonnance-a5.pdf"));
        Files.copy(WORKER.resolve("assets/LiberationSans-Regular.ttf"), root.resolve("assets/LiberationSans-Regular.ttf"));
        Map<String, String> files = new TreeMap<>();
        for (String name : List.of(LocalPrescriptionRenderer.WORKER, "assets/ordonnance-a5.pdf", "assets/LiberationSans-Regular.ttf"))
            files.put(name, LocalPrescriptionRenderer.digest(Files.readAllBytes(root.resolve(name))));
        Files.write(root.resolve("manifest.json"), JSON.writeValueAsBytes(Map.of("protocolVersion", 1, "rendererId", "prescription-a5-v1", "files", files)));
        return root;
    }
}
