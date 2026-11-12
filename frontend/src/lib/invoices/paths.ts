export const invoiceHistoryPath = (patientId: string) => `/patients/${encodeURIComponent(patientId)}/factures`;
export const newInvoicePath = (patientId?: string) => `/facturation/nouvelle${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`;
export const invoicePath = (patientId: string, invoiceId: string, edit = false) =>
  `/facturation/${encodeURIComponent(invoiceId)}${edit ? "/modifier" : ""}?patientId=${encodeURIComponent(patientId)}`;
