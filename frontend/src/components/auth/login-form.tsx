"use client";

import { useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginSchema, type LoginCredentials } from "@/lib/auth/login-schema";
import {
  authenticationService,
  AUTHENTICATION_NOTICE,
} from "@/lib/auth/authentication-service";

// Keep credential controls inert until the client submit handler is attached.
const subscribeToHydration = () => () => {};

export function LoginForm() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function submit(credentials: LoginCredentials) {
    setNotice("");
    try {
      const result = await authenticationService.signIn(credentials);
      setNotice(result.message);
    } catch {
      setNotice(
        "Le service de connexion est indisponible. Veuillez réessayer ultérieurement.",
      );
    } finally {
      resetField("password");
      setShowPassword(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(submit, () => setNotice(""))}
      aria-describedby="login-prototype-note"
      aria-busy={isSubmitting}
      className="space-y-6"
    >
      <noscript>
        <p className="text-sm text-primary">
          Activez JavaScript pour essayer la validation du formulaire.
        </p>
      </noscript>
      <p
        id="login-prototype-note"
        className="rounded-lg border border-secondary/30 bg-secondary-tint px-4 py-3 text-sm leading-6 text-foreground"
      >
        {AUTHENTICATION_NOTICE} Utilisez uniquement des valeurs fictives.
      </p>
      <div className="space-y-2">
        <label htmlFor="identifier" className="block text-sm font-semibold">
          Identifiant{" "}
          <span className="font-normal text-muted-foreground">
            (obligatoire)
          </span>
        </label>
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={!hydrated || isSubmitting}
          aria-invalid={Boolean(errors.identifier)}
          aria-describedby={errors.identifier ? "identifier-error" : undefined}
          {...register("identifier")}
        />
        {errors.identifier && (
          <p id="identifier-error" role="alert" className="text-sm text-danger">
            {errors.identifier.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-semibold">
          Mot de passe{" "}
          <span className="font-normal text-muted-foreground">
            (obligatoire)
          </span>
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={!hydrated || isSubmitting}
            className="pr-14"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={!hydrated || isSubmitting}
            aria-label={
              showPassword
                ? "Masquer le mot de passe"
                : "Afficher le mot de passe"
            }
            aria-controls="password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1 right-1 min-h-10 w-10 px-0"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </Button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-sm text-danger">
            {errors.password.message}
          </p>
        )}
      </div>
      <Button
        type="submit"
        disabled={!hydrated || isSubmitting}
        className="login-submit min-h-12 w-full justify-between px-5"
      >
        <span>{isSubmitting ? "Vérification en cours…" : "Se connecter"}</span>
        <ArrowRight aria-hidden="true" />
      </Button>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          notice
            ? "rounded-lg border bg-muted px-4 py-3 text-sm leading-6"
            : "sr-only"
        }
      >
        {notice}
      </p>
    </form>
  );
}
