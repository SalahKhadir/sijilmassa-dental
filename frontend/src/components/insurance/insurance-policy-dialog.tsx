"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  BeneficiaryRelationship,
  CreatePolicyInput,
  InsuranceProvider,
  PatientInsurancePolicy,
} from "@/lib/insurance/types";
import {
  beneficiaryRelationships,
  insuranceProviders,
  relationshipLabels,
} from "@/lib/insurance/types";
import type { Patient } from "@/lib/patients/types";
import { useInsurance } from "./insurance-provider";

interface InsurancePolicyDialogProps {
  patient: Patient;
  existingPolicy?: PatientInsurancePolicy;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (policy: PatientInsurancePolicy) => void;
}

function InsurancePolicyForm({
  patient,
  existingPolicy,
  onClose,
  onSaved,
}: {
  patient: Patient;
  existingPolicy?: PatientInsurancePolicy;
  onClose: () => void;
  onSaved?: (policy: PatientInsurancePolicy) => void;
}) {
  const { createPolicy, updatePolicy } = useInsurance();

  const [provider, setProvider] = useState<InsuranceProvider>(
    existingPolicy?.provider || "CNSS",
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    existingPolicy?.registrationNumber || "",
  );
  const [affiliationNumber, setAffiliationNumber] = useState(
    existingPolicy?.affiliationNumber || "",
  );
  const [militaryAccountNumber, setMilitaryAccountNumber] = useState(
    existingPolicy?.militaryAccountNumber || "",
  );
  const [militaryRank, setMilitaryRank] = useState(
    existingPolicy?.militaryRank || "",
  );
  const [militaryUnit, setMilitaryUnit] = useState(
    existingPolicy?.militaryUnit || "",
  );

  // Insured person
  const [isPatient, setIsPatient] = useState(
    existingPolicy ? existingPolicy.insuredPerson.isPatient : true,
  );
  const [firstName, setFirstName] = useState(
    existingPolicy?.insuredPerson.firstName || patient.identity.firstName,
  );
  const [lastName, setLastName] = useState(
    existingPolicy?.insuredPerson.lastName || patient.identity.lastName,
  );
  const [cin, setCin] = useState(
    existingPolicy?.insuredPerson.cin || patient.identity.cin || "",
  );
  const [address, setAddress] = useState(
    existingPolicy?.insuredPerson.address || patient.identity.address || "",
  );
  const [phone, setPhone] = useState(
    existingPolicy?.insuredPerson.phone ||
      patient.identity.gsm ||
      patient.identity.landline ||
      "",
  );
  const [relationship, setRelationship] = useState<BeneficiaryRelationship>(
    existingPolicy?.insuredPerson.relationship || "LUI_MEME",
  );
  const [active, setActive] = useState(
    existingPolicy ? existingPolicy.active : true,
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleIsPatientChange = (checked: boolean) => {
    setIsPatient(checked);
    if (checked) {
      setFirstName(patient.identity.firstName);
      setLastName(patient.identity.lastName);
      setCin(patient.identity.cin || "");
      setAddress(patient.identity.address || "");
      setPhone(patient.identity.gsm || patient.identity.landline || "");
      setRelationship("LUI_MEME");
    } else {
      if (relationship === "LUI_MEME") {
        setRelationship("CONJOINT");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!firstName.trim() || !lastName.trim()) {
        throw new Error("Le nom et prénom de l'assuré(e) sont obligatoires.");
      }

      const input: CreatePolicyInput = {
        patientId: patient.id,
        provider,
        registrationNumber: registrationNumber.trim(),
        affiliationNumber: affiliationNumber.trim(),
        militaryAccountNumber: militaryAccountNumber.trim(),
        militaryRank: militaryRank.trim(),
        militaryUnit: militaryUnit.trim(),
        insuredPerson: {
          isPatient,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          cin: cin.trim(),
          address: address.trim(),
          phone: phone.trim(),
          relationship: isPatient ? "LUI_MEME" : relationship,
        },
        active,
      };

      let saved: PatientInsurancePolicy;
      if (existingPolicy) {
        saved = await updatePolicy(existingPolicy.id, input);
      } else {
        saved = await createPolicy(input);
      }

      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue lors de l'enregistrement.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <Dialog.Title className="text-lg font-bold text-foreground">
            {existingPolicy
              ? "Modifier la couverture d'assurance"
              : "Ajouter une couverture d'assurance"}
          </Dialog.Title>
          <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
            Dossier de {patient.identity.firstName} {patient.identity.lastName} ({patient.reference})
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus:outline-hidden"
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>
        </Dialog.Close>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {/* Provider selection */}
        <div className="space-y-1.5">
          <label
            htmlFor="policy-provider"
            className="block text-sm font-semibold text-foreground"
          >
            Organisme d’assurance
          </label>
          <Select
            id="policy-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as InsuranceProvider)}
          >
            {insuranceProviders.map((p) => (
              <option key={p} value={p}>
                {p === "CNSS" && "CNSS (Caisse Nationale de Sécurité Sociale)"}
                {p === "CNOPS" && "CNOPS (Caisse Nationale des Organismes de Prévoyance Sociale)"}
                {p === "FAR" && "FAR (Forces Armées Royales — Mutuelle)"}
              </option>
            ))}
          </Select>
        </div>

        {/* Identifiers */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="policy-registration"
              className="block text-sm font-semibold text-foreground"
            >
              N° d’immatriculation
            </label>
            <Input
              id="policy-registration"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="Ex : 182930419"
            />
          </div>

          {provider === "CNOPS" && (
            <div className="space-y-1.5">
              <label
                htmlFor="policy-affiliation"
                className="block text-sm font-semibold text-foreground"
              >
                N° d’affiliation (CNOPS)
              </label>
              <Input
                id="policy-affiliation"
                value={affiliationNumber}
                onChange={(e) => setAffiliationNumber(e.target.value)}
                placeholder="Ex : 1234567890"
              />
            </div>
          )}
        </div>

        {/* FAR Specific Fields */}
        {provider === "FAR" && (
          <div className="rounded-md border border-secondary/30 bg-secondary-tint/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Informations militaires (FAR)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="policy-mil-account"
                  className="block text-xs font-semibold"
                >
                  N° de Compte
                </label>
                <Input
                  id="policy-mil-account"
                  value={militaryAccountNumber}
                  onChange={(e) => setMilitaryAccountNumber(e.target.value)}
                  placeholder="Ex : 1234567"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="policy-mil-rank"
                  className="block text-xs font-semibold"
                >
                  Grade
                </label>
                <Input
                  id="policy-mil-rank"
                  value={militaryRank}
                  onChange={(e) => setMilitaryRank(e.target.value)}
                  placeholder="Ex : Adjudant"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="policy-mil-unit"
                  className="block text-xs font-semibold"
                >
                  Unité
                </label>
                <Input
                  id="policy-mil-unit"
                  value={militaryUnit}
                  onChange={(e) => setMilitaryUnit(e.target.value)}
                  placeholder="Ex : 1er B.I.M."
                />
              </div>
            </div>
          </div>
        )}

        {/* Insured Person section */}
        <div className="rounded-md border p-3.5 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Identité de l’assuré(e) principal(e)
            </p>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={isPatient}
                onChange={(e) => handleIsPatientChange(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Le patient est l’assuré(e)</span>
            </label>
          </div>

          {!isPatient && (
            <div className="space-y-1.5">
              <label
                htmlFor="policy-rel"
                className="block text-xs font-semibold"
              >
                Lien de parenté avec le patient bénéficiaire
              </label>
              <Select
                id="policy-rel"
                value={relationship}
                onChange={(e) =>
                  setRelationship(
                    e.target.value as BeneficiaryRelationship,
                  )
                }
              >
                {beneficiaryRelationships
                  .filter((r) => r !== "LUI_MEME")
                  .map((r) => (
                    <option key={r} value={r}>
                      {relationshipLabels[r]}
                    </option>
                  ))}
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="policy-fname" className="block text-xs font-semibold">
                Prénom de l’assuré(e)
              </label>
              <Input
                id="policy-fname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPatient}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="policy-lname" className="block text-xs font-semibold">
                Nom de l’assuré(e)
              </label>
              <Input
                id="policy-lname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPatient}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="policy-cin" className="block text-xs font-semibold">
                CIN de l’assuré(e)
              </label>
              <Input
                id="policy-cin"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                placeholder="Ex : AB123456"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="policy-phone" className="block text-xs font-semibold">
                Téléphone de l’assuré(e)
              </label>
              <Input
                id="policy-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex : +212 6XX XX XX XX"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="policy-addr" className="block text-xs font-semibold">
              Adresse de l’assuré(e)
            </label>
            <Input
              id="policy-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adresse complète"
            />
          </div>
        </div>

        {/* Active status */}
        <div className="flex items-center gap-2">
          <input
            id="policy-active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="policy-active" className="text-sm cursor-pointer">
            Couverture active
          </label>
        </div>

        {/* Dialog Footer Actions */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Enregistrement..."
              : existingPolicy
                ? "Mettre à jour"
                : "Enregistrer la couverture"}
          </Button>
        </div>
      </form>
    </>
  );
}

export function InsurancePolicyDialog({
  patient,
  existingPolicy,
  isOpen,
  onClose,
  onSaved,
}: InsurancePolicyDialogProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-xs" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[95vw] max-w-xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-xl border border-border">
          {isOpen && (
            <InsurancePolicyForm
              key={existingPolicy ? existingPolicy.id : "new"}
              patient={patient}
              existingPolicy={existingPolicy}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
