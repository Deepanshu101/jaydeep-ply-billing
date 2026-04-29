"use client";

import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/button";
import { quotationShareTemplates } from "@/lib/share-templates";

export function QuotationShareActions({
  quotationId,
  customerId,
  quotationNo,
  clientName,
  projectName,
  grandTotal,
  pdfUrl,
}: {
  quotationId: string;
  customerId: string;
  quotationNo: string;
  clientName: string;
  projectName: string;
  grandTotal?: number;
  pdfUrl: string;
}) {
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [toast, setToast] = useState("");
  const title = `Quotation ${quotationNo} from Jaydeep Ply`;
  const shareText = useMemo(
    () =>
      quotationShareTemplates.whatsapp({
        quotationNo,
        clientName,
        projectName,
        grandTotal,
        pdfUrl,
      }),
    [quotationNo, clientName, projectName, grandTotal, pdfUrl],
  );
  const emailBody = useMemo(
    () =>
      quotationShareTemplates.emailBody({
        quotationNo,
        clientName,
        projectName,
        grandTotal,
        pdfUrl,
      }),
    [quotationNo, clientName, projectName, grandTotal, pdfUrl],
  );
  const message = `Please find quotation ${quotationNo}${projectName ? ` for ${projectName}` : ""}${grandTotal ? ` amounting to ${inr(grandTotal)}` : ""}.`;

  const whatsappUrl = useMemo(() => {
    return `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  }, [shareText]);

  const emailUrl = useMemo(() => {
    return `mailto:?subject=${encodeURIComponent(quotationShareTemplates.emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  }, [emailBody]);

  async function logCommunication(channel: "whatsapp" | "email" | "system", subject: string, body: string) {
    try {
      await fetch("/api/communications/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          quotation_id: quotationId,
          channel,
          direction: "outbound",
          subject,
          body,
          status: "sent",
        }),
      });
    } catch {
      // Sharing should never be blocked by logging.
    }
  }

  async function shareQuotation() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: message, url: pdfUrl });
        await logCommunication("system", title, shareText);
        setToast("Quotation share sheet opened.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    setShowCopyModal(true);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(pdfUrl);
    await logCommunication("system", `Copied ${quotationNo} PDF link`, pdfUrl);
    setShowCopyModal(false);
    setToast("Quotation PDF link copied.");
    window.setTimeout(() => setToast(""), 2400);
  }

  async function copyWhatsAppText() {
    await navigator.clipboard.writeText(shareText);
    await logCommunication("system", `Copied WhatsApp text ${quotationNo}`, shareText);
    setToast("WhatsApp message copied.");
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <div className="relative flex flex-wrap gap-2">
      <ButtonLink variant="secondary" href={pdfUrl}>
        Download PDF
      </ButtonLink>
      <Button type="button" variant="secondary" onClick={shareQuotation}>
        Share
      </Button>
      <a
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#1f6f50] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#18583f]"
        href={whatsappUrl}
        onClick={() => logCommunication("whatsapp", `WhatsApp quotation ${quotationNo}`, shareText)}
        target="_blank"
        rel="noreferrer"
      >
        Share via WhatsApp
      </a>
      <a
        className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#cdd6cf] bg-white px-4 py-2 text-sm font-semibold text-[#1d2520] shadow-sm hover:bg-[#eef3ee]"
        href={emailUrl}
        onClick={() =>
          logCommunication(
            "email",
            quotationShareTemplates.emailSubject,
            emailBody,
          )
        }
      >
        Share via Email
      </a>
      <Button type="button" variant="secondary" onClick={copyWhatsAppText}>
        Copy WhatsApp text
      </Button>

      {toast ? (
        <div className="absolute right-0 top-12 z-20 rounded-md bg-[#1d2520] px-3 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {showCopyModal ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-xl font-bold">Copy quotation link</h2>
            <p className="mt-2 text-sm text-[#5d6b60]">Native sharing is not available in this browser.</p>
            <textarea
              className="mt-4 min-h-32 w-full rounded-md border border-[#cdd6cf] px-3 py-2 text-sm"
              readOnly
              value={shareText}
              onFocus={(event) => event.currentTarget.select()}
            />
            <input
              className="mt-3 w-full rounded-md border border-[#cdd6cf] px-3 py-2 text-sm"
              readOnly
              value={pdfUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={copyWhatsAppText}>
                Copy text
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCopyModal(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={copyLink}>
                Copy link
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function inr(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
