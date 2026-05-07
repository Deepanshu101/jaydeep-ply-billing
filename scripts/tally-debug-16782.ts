import { invoiceToTallyXmlFromTemplate, postToTally, tallySalesVoucherTemplateProbeXml } from "../src/lib/tally";
import type { Invoice } from "../src/lib/types";

const invoice: Invoice = {
  id: "debug",
  invoice_no: "16782",
  quotation_id: null,
  customer_id: "",
  client_name: "Rokoko Interior Designers Pvt Ltd",
  project_name: "Nigdi",
  address: "C 77 Gajalaxmi Society Sahakar Nagar, Pune, Rokoko Interior Designers Pvt Ltd",
  gst_number: "27AAHCR8718G1Z1",
  invoice_date: "2026-04-30",
  due_date: "2026-05-01",
  dispatch_doc_no: "",
  dispatch_date: null,
  dispatched_through: "Self",
  destination: "",
  carrier_name: "",
  bill_lading_no: "",
  vehicle_no: "",
  order_no: "Verbally",
  order_date: null,
  payment_terms: "Immediate",
  other_references: "",
  terms_of_delivery: "",
  subtotal: 3085,
  discount_type: "amount",
  discount_value: 0,
  discount_amount: 0,
  gst_percent: 18,
  cgst: 277.65,
  sgst: 277.65,
  grand_total: 3640.3,
  amount_in_words: "",
  terms: "",
  created_at: "",
  invoice_items: [
    { description: "Drawer Lock", specification: "Europa", qty: 9, unit: "Nos", rate: 175, amount: 1575 },
    { description: "Abrotape (Roll)", specification: "", qty: 2, unit: "Roll", rate: 130, amount: 260 },
    { description: "Nail Free", specification: "", qty: 2, unit: "nos", rate: 350, amount: 700 },
    { description: "Fevicol Ezzespray (Nos)", specification: "", qty: 1, unit: "nos", rate: 550, amount: 550 },
  ],
};

async function main() {
  const template = await postToTally(
    tallySalesVoucherTemplateProbeXml("Sales GST", invoice.invoice_date, invoice.invoice_date),
    "debug sales voucher template fetch 16782",
  );
  const xml = invoiceToTallyXmlFromTemplate(template, invoice, {
    voucherTypeName: "Sales GST",
    salesLedgerName: "Sales Local Taxable - GST 18%",
    cgstLedgerName: "CGST",
    sgstLedgerName: "SGST",
    godownName: "Main Location",
  });
  const response = await postToTally(xml, "debug template import 16782");
  console.log(response);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
