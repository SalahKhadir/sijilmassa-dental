package ma.sijilmassa.security;

import java.io.Console;
import java.util.Arrays;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("bootstrap")
public class BootstrapCommand implements ApplicationRunner {
    private final AccountBootstrap bootstrap;
    private final ConfigurableApplicationContext context;

    public BootstrapCommand(AccountBootstrap bootstrap, ConfigurableApplicationContext context) {
        this.bootstrap = bootstrap;
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) {
        Console console = System.console();
        if (console == null) {
            throw new IllegalStateException("Un terminal interactif local est obligatoire pour initialiser les comptes.");
        }
        char[] dentist = null;
        char[] reception = null;
        try {
            String dentistName = console.readLine("Identifiant dentiste : ");
            dentist = password(console, "dentiste");
            String receptionName = console.readLine("Identifiant réception : ");
            reception = password(console, "réception");
            if (dentistName == null || receptionName == null) {
                throw new IllegalStateException("Initialisation annulée.");
            }
            bootstrap.initialize(dentistName, new String(dentist), receptionName, new String(reception));
            console.printf("Les deux comptes ont été créés. Aucun serveur HTTP n’a été démarré.%n");
        } finally {
            if (dentist != null) { Arrays.fill(dentist, '\0'); }
            if (reception != null) { Arrays.fill(reception, '\0'); }
            context.close();
        }
    }

    private char[] password(Console console, String role) {
        char[] password = console.readPassword("Mot de passe %s : ", role);
        char[] confirmation = console.readPassword("Confirmer le mot de passe : ");
        try {
            if (password == null || confirmation == null || !Arrays.equals(password, confirmation)) {
                if (password != null) { Arrays.fill(password, '\0'); }
                throw new IllegalArgumentException("Confirmation incorrecte ou initialisation annulée.");
            }
            return password;
        } finally {
            if (confirmation != null) { Arrays.fill(confirmation, '\0'); }
        }
    }
}
