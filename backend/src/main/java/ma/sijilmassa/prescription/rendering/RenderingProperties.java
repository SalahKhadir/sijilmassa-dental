package ma.sijilmassa.prescription.rendering;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "prescription.rendering")
public class RenderingProperties {
    private boolean enabled;
    private Path nodeExecutable;
    private Path workerDirectory;
    private Path modulesDirectory;
    private String manifestSha256;
    private Duration timeout = Duration.ofSeconds(5);
    private int maxPdfBytes = 2 * 1024 * 1024;
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public Path getNodeExecutable() { return nodeExecutable; }
    public void setNodeExecutable(Path value) { nodeExecutable = value; }
    public Path getWorkerDirectory() { return workerDirectory; }
    public void setWorkerDirectory(Path value) { workerDirectory = value; }
    public Path getModulesDirectory() { return modulesDirectory; }
    public void setModulesDirectory(Path value) { modulesDirectory = value; }
    public String getManifestSha256() { return manifestSha256; }
    public void setManifestSha256(String value) { manifestSha256 = value; }
    public Duration getTimeout() { return timeout; }
    public void setTimeout(Duration value) { timeout = value; }
    public int getMaxPdfBytes() { return maxPdfBytes; }
    public void setMaxPdfBytes(int value) { maxPdfBytes = value; }
}
