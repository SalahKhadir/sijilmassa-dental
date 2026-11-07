export type InvoiceLifecycle = "BROUILLON" | "EMISE" | "ANNULEE";
export const invoiceStatuses = {
  BROUILLON: "Brouillon",
  EMISE: "Émise",
  PARTIELLEMENT_PAYEE: "Partiellement payée",
  PAYEE: "Payée",
  ANNULEE: "Annulée",
} as const;
export type InvoiceStatus = keyof typeof invoiceStatuses;
export const paymentMethods = {
  ESPECES: "Espèces",
  CARTE: "Carte bancaire",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
} as const;
export type PaymentMethod = keyof typeof paymentMethods;
export interface BillableService {
  id: string;
  name: string;
  category: string;
  description: string;
  suggestedPriceMinor?: number;
  active: boolean;
}
export interface InvoiceLineInput {
  id?: string;
  performedDate?: string;
  toothNumber?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  serviceId: string;
  sourceTreatmentId: string;
}
export interface InvoiceLine extends InvoiceLineInput {
  id: string;
  lineTotalMinor: number;
}
export interface InvoiceInput {
  patientId: string;
  consultationId: string;
  issueDate: string;
  lines: InvoiceLineInput[];
}
export interface Invoice extends Omit<InvoiceInput, "lines"> {
  id: string;
  invoiceNumber: string;
  lifecycle: InvoiceLifecycle;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  issuedPatient?: { name: string; reference: string };
}
export interface PaymentInput {
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  operationId: string;
}
export interface Payment extends PaymentInput {
  id: string;
  patientId: string;
  createdAt: string;
}
export interface InvoiceRepository {
  list(): Promise<Invoice[]>;
  getById(id: string): Promise<Invoice | undefined>;
  create(input: InvoiceInput): Promise<Invoice>;
  updateDraft(id: string, input: InvoiceInput): Promise<Invoice>;
  issue(id: string): Promise<Invoice>;
  cancel(id: string, reason: string): Promise<Invoice>;
}
export interface PaymentRepository {
  list(): Promise<Payment[]>;
  create(input: PaymentInput): Promise<Payment>;
}
export interface BillableServiceRepository {
  list(): Promise<BillableService[]>;
  getById(id: string): Promise<BillableService | undefined>;
}
export interface BillingRepositories {
  invoices: InvoiceRepository;
  payments: PaymentRepository;
  services: BillableServiceRepository;
}
