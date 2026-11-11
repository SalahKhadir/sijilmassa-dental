package ma.sijilmassa.prescription.rendering;

import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static ma.sijilmassa.prescription.rendering.RenderingFailure.Code.*;

@Component
public class LocalPrescriptionRenderer {
    static final int MAX_INPUT_BYTES = 1024 * 1024;
    static final String WORKER = "server/prescription-renderer/worker.js";
    public static final String TEMPLATE = "9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd";
    static final String FONT = "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8";
    private final RenderingProperties config;
    private final JsonMapper json;
    private final PrescriptionPdfValidator validator;
    private final Semaphore capacity = new Semaphore(1);
    private final AtomicReference<Process> active = new AtomicReference<>();
    private final RenderingFailure.Code startupFailure;
    private volatile boolean closed;

    public LocalPrescriptionRenderer(RenderingProperties config, JsonMapper json, PrescriptionPdfValidator validator) {
        this.config = config; this.json = json; this.validator = validator;
        RenderingFailure.Code failure = null;
        if (config.isEnabled()) {
            try { trustedPaths(); }
            catch (RenderingFailure exception) { failure = exception.code(); }
            catch (IOException | RuntimeException exception) { failure = UNAVAILABLE; }
        }
        startupFailure = failure;
    }
    public RenderedPdf render(RenderingRequest request) {
        if (closed || !config.isEnabled()) throw new RenderingFailure(UNAVAILABLE);
        if (startupFailure != null) throw new RenderingFailure(startupFailure);
        if (!capacity.tryAcquire()) throw new RenderingFailure(BUSY);
        ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();
        Process process = null;
        try {
            Duration timeout = config.getTimeout();
            if (timeout == null || timeout.toMillis() < 50 || timeout.toMillis() > 5000 || config.getMaxPdfBytes() < 1
                    || config.getMaxPdfBytes() > 2 * 1024 * 1024) throw new RenderingFailure(UNAVAILABLE);
            var paths = trustedPaths();
            if (request == null || request.protocolVersion() != 1 || request.requestId() == null) throw new RenderingFailure(INVALID_INPUT);
            byte[] input = json.writeValueAsBytes(request);
            if (input.length > MAX_INPUT_BYTES) throw new RenderingFailure(INVALID_INPUT);
            long deadline = System.nanoTime() + timeout.toNanos();
            // ProcessBuilder receives individual fixed arguments, never a shell or an input-supplied path.
            var builder = new ProcessBuilder(paths.node().toString(), "--max-old-space-size=192", "--permission",
                    "--allow-fs-read=" + paths.directory(), "--allow-fs-read=" + paths.modules(), paths.directory().resolve(WORKER).toString());
            builder.directory(paths.directory().toFile());
            builder.environment().clear(); builder.environment().put("LANG", "C.UTF-8"); builder.environment().put("TZ", "UTC");
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            process = builder.start(); active.set(process);
            if (closed) throw new RenderingFailure(UNAVAILABLE);
            Process child = process;
            int limit = ((2 * 1024 * 1024 + 2) / 3) * 4 + 4096;
            Future<byte[]> read = io.submit(() -> bounded(child.getInputStream(), limit));
            Future<?> write = io.submit(() -> {
                try (var output = child.getOutputStream()) { output.write(input); }
                return null;
            });
            while (process.isAlive()) {
                if (read.isDone()) result(read, deadline); // Fail immediately on output overflow.
                long remaining = remaining(deadline);
                process.waitFor(Math.min(remaining, TimeUnit.MILLISECONDS.toNanos(20)), TimeUnit.NANOSECONDS);
            }
            byte[] output = result(read, deadline); result(write, deadline);
            if (process.exitValue() != 0) throw new RenderingFailure(UNAVAILABLE);
            var pdf = response(output, request, config.getMaxPdfBytes());
            remaining(deadline);
            return pdf;
        } catch (RenderingFailure failure) { throw failure; }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new RenderingFailure(UNAVAILABLE); }
        catch (IOException | RuntimeException exception) { throw new RenderingFailure(UNAVAILABLE); }
        finally {
            destroy(process); active.compareAndSet(process, null); io.shutdownNow(); capacity.release();
        }
    }
    private record Paths(Path node, Path directory, Path modules) { }
    private Paths trustedPaths() throws IOException {
        if (config.getNodeExecutable() == null || config.getWorkerDirectory() == null || config.getModulesDirectory() == null
                || !config.getNodeExecutable().isAbsolute() || !config.getWorkerDirectory().isAbsolute() || !config.getModulesDirectory().isAbsolute()
                || config.getManifestSha256() == null || !config.getManifestSha256().matches("[0-9a-f]{64}")) throw new RenderingFailure(UNAVAILABLE);
        Path node = config.getNodeExecutable().toRealPath(), root = config.getWorkerDirectory().toRealPath(), modules = config.getModulesDirectory().toRealPath();
        if (!Files.isExecutable(node) || !Files.isDirectory(modules)) throw new RenderingFailure(UNAVAILABLE);
        byte[] manifest = bounded(Files.newInputStream(root.resolve("manifest.json")), 32768);
        if (!digest(manifest).equals(config.getManifestSha256())) throw new RenderingFailure(UNTRUSTED_WORKER);
        JsonNode tree = json.readTree(manifest);
        if (!keys(tree, Set.of("protocolVersion", "rendererId", "files")) || !tree.get("protocolVersion").isIntegralNumber()
                || tree.get("protocolVersion").asInt() != 1 || !"prescription-a5-v1".equals(tree.get("rendererId").asString())) throw new RenderingFailure(UNTRUSTED_WORKER);
        var files = tree.get("files");
        if (!files.isObject() || files.size() > 64 || files.get(WORKER) == null
                || files.get("assets/ordonnance-a5.pdf") == null || files.get("assets/LiberationSans-Regular.ttf") == null)
            throw new RenderingFailure(UNTRUSTED_WORKER);
        Set<String> inventory = new HashSet<>();
        try (var walk = Files.walk(root)) {
            var iterator = walk.iterator();
            while (iterator.hasNext()) {
                Path path = iterator.next();
                if (Files.isSymbolicLink(path)) throw new RenderingFailure(UNTRUSTED_WORKER);
                if (Files.isRegularFile(path)) inventory.add(root.relativize(path).toString().replace(File.separatorChar, '/'));
                if (inventory.size() > 65) throw new RenderingFailure(UNTRUSTED_WORKER);
            }
        }
        Set<String> expected = new HashSet<>(files.properties().stream().map(Map.Entry::getKey).toList()); expected.add("manifest.json");
        if (!expected.equals(inventory)) throw new RenderingFailure(UNTRUSTED_WORKER);
        for (var entry : files.properties()) {
            String relative = entry.getKey(); Path path = root.resolve(relative).normalize();
            if (relative.contains("\\") || !path.startsWith(root) || !path.toRealPath().startsWith(root)
                    || Files.isSymbolicLink(path) || !entry.getValue().isString()
                    || !digest(bounded(Files.newInputStream(path), 8 * 1024 * 1024)).equals(entry.getValue().asString()))
                throw new RenderingFailure(UNTRUSTED_WORKER);
        }
        if (!TEMPLATE.equals(files.get("assets/ordonnance-a5.pdf").asString()) || !FONT.equals(files.get("assets/LiberationSans-Regular.ttf").asString()))
            throw new RenderingFailure(UNTRUSTED_WORKER);
        return new Paths(node, root, modules);
    }
    private RenderedPdf response(byte[] output, RenderingRequest request, int maxBytes) {
        try {
            var value = json.readTree(output);
            if (value == null || !value.isObject() || value.get("protocolVersion") == null || !value.get("protocolVersion").isIntegralNumber()
                    || value.get("protocolVersion").asInt() != 1 || value.get("requestId") == null
                    || !request.requestId().toString().equals(value.get("requestId").asString()) || value.get("ok") == null || !value.get("ok").isBoolean())
                throw new RenderingFailure(INVALID_OUTPUT);
            if (!value.get("ok").asBoolean()) {
                if (!keys(value, Set.of("protocolVersion", "requestId", "ok", "code"))) throw new RenderingFailure(INVALID_OUTPUT);
                throw new RenderingFailure(switch (value.get("code").asString()) {
                    case "INVALID_INPUT" -> INVALID_INPUT;
                    case "LAYOUT_OVERFLOW" -> LAYOUT_OVERFLOW;
                    case "UNSUPPORTED_CHARACTER" -> UNSUPPORTED_CHARACTER;
                    case "ASSET_INVALID" -> UNAVAILABLE;
                    default -> INVALID_OUTPUT;
                });
            }
            if (!keys(value, Set.of("protocolVersion", "requestId", "ok", "pdfBase64", "pdfBytes", "sha256", "templateSha256", "fontSha256", "rendererId"))
                    || !value.get("pdfBase64").isString() || !value.get("pdfBytes").isIntegralNumber()
                    || !TEMPLATE.equals(value.get("templateSha256").asString()) || !FONT.equals(value.get("fontSha256").asString())
                    || !"prescription-a5-v1".equals(value.get("rendererId").asString())) throw new RenderingFailure(INVALID_OUTPUT);
            byte[] bytes = Base64.getDecoder().decode(value.get("pdfBase64").asString());
            String hash = digest(bytes);
            if (bytes.length != value.get("pdfBytes").asLong() || !hash.equals(value.get("sha256").asString())) throw new RenderingFailure(INVALID_OUTPUT);
            validator.validate(bytes, maxBytes);
            return new RenderedPdf(bytes, hash, "prescription-a5-v1", TEMPLATE, FONT);
        } catch (RenderingFailure failure) { throw failure; }
        catch (RuntimeException exception) { throw new RenderingFailure(INVALID_OUTPUT); }
    }
    private static boolean keys(JsonNode value, Set<String> names) {
        return value.isObject() && value.properties().stream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet()).equals(names);
    }
    static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    private static byte[] bounded(InputStream source, int limit) throws IOException {
        try (source) {
            byte[] bytes = source.readNBytes(limit + 1);
            if (bytes.length > limit) throw new RenderingFailure(INVALID_OUTPUT);
            return bytes;
        }
    }
    private static long remaining(long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) throw new RenderingFailure(TIMEOUT);
        return remaining;
    }
    private static <T> T result(Future<T> value, long deadline) throws InterruptedException {
        try { return value.get(remaining(deadline), TimeUnit.NANOSECONDS); }
        catch (TimeoutException exception) { throw new RenderingFailure(TIMEOUT); }
        catch (ExecutionException exception) {
            if (exception.getCause() instanceof RenderingFailure failure) throw failure;
            throw new RenderingFailure(UNAVAILABLE);
        }
    }
    private static void destroy(Process process) {
        if (process == null) return;
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
        try { process.waitFor(200, TimeUnit.MILLISECONDS); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
        try { process.getInputStream().close(); process.getOutputStream().close(); process.getErrorStream().close(); }
        catch (IOException ignored) { /* No sensitive diagnostics. */ }
    }
    @PreDestroy public void close() { closed = true; destroy(active.get()); }
}
