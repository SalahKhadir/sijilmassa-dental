import type { LoginCredentials } from "./login-schema";

export const AUTHENTICATION_NOTICE =
  "L’authentification sera disponible après l’intégration du backend Spring Boot. Cette page permet de prévisualiser et de valider le formulaire.";

/** Provisional frontend port. A future adapter will use Spring Security sessions.
 * Its response contract will be extended when the backend API is defined.
 */
export interface AuthenticationResult {
  status: "unavailable";
  message: string;
}
export interface AuthenticationService {
  signIn(credentials: LoginCredentials): Promise<AuthenticationResult>;
}

/** Intentionally ignores credentials. No transport, logging, or persistence. */
export const authenticationService: AuthenticationService = {
  async signIn() {
    return {
      status: "unavailable",
      message:
        "Connexion indisponible pour le moment. L’authentification sera disponible après l’intégration du backend Spring Boot.",
    };
  },
};
