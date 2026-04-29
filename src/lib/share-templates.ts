type QuotationShareInput = {
  quotationNo: string;
  clientName: string;
  projectName?: string;
  grandTotal?: number;
  pdfUrl: string;
};

export const quotationShareTemplates = {
  emailSubject: "Quotation from Jaydeep Ply",
  whatsapp({ quotationNo, clientName, projectName, grandTotal, pdfUrl }: QuotationShareInput) {
    return [
      "Dear Sir/Madam,",
      "",
      `Please find our quotation ${quotationNo}${projectName ? ` for ${projectName}` : ""} for your kind review.`,
      grandTotal ? `Quoted amount: ${inr(grandTotal)}` : "",
      clientName ? `Client: ${clientName}` : "",
      "",
      "Kindly review the same and let us know in case of any queries, clarification, or required changes.",
      "",
      pdfUrl,
      "",
      "Regards,",
      "Jaydeep Ply",
    ]
      .filter(Boolean)
      .join("\n");
  },
  emailBody({ quotationNo, clientName, projectName, grandTotal, pdfUrl }: QuotationShareInput) {
    return [
      "Dear Sir/Madam,",
      "",
      `Please find our quotation ${quotationNo}${projectName ? ` for ${projectName}` : ""} for your kind reference.`,
      grandTotal ? `Quoted amount: ${inr(grandTotal)}` : "",
      clientName ? `Client: ${clientName}` : "",
      "",
      "Kindly review the same and let us know if any clarification, modification, or additional requirement is needed.",
      "",
      pdfUrl,
      "",
      "We shall be glad to assist you.",
      "",
      "Regards,",
      "Jaydeep Ply",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const communicationTemplates = {
  quotationReminder:
    "Dear Sir/Madam,\n\nGentle reminder regarding the quotation shared earlier for your kind review.\n\nPlease let us know if any clarification, modification, or additional requirement is needed.\n\nRegards,\nJaydeep Ply",
  revisedQuotation:
    "Dear Sir/Madam,\n\nAs discussed, please find the revised quotation for your kind reference.\n\nKindly review the same and confirm if we may proceed further.\n\nRegards,\nJaydeep Ply",
  negotiationReply:
    "Dear Sir/Madam,\n\nThank you for your feedback. We have reviewed the rates and specifications carefully.\n\nPlease find the updated details for your consideration.\n\nRegards,\nJaydeep Ply",
  dispatchReadiness:
    "Dear Sir/Madam,\n\nThe material is ready for dispatch. Kindly confirm delivery schedule and site readiness.\n\nRegards,\nJaydeep Ply",
  paymentReminder:
    "Dear Sir/Madam,\n\nGentle reminder regarding the pending payment. Kindly arrange the same at the earliest.\n\nPlease let us know if any details are required from our side.\n\nRegards,\nJaydeep Ply",
  sternPaymentReminder:
    "Dear Sir/Madam,\n\nThis is a follow-up regarding the overdue payment pending against your account.\n\nWe request you to clear the outstanding amount immediately to avoid further escalation.\n\nRegards,\nJaydeep Ply",
};

function inr(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
