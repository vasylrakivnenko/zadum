import { Router } from "express";
export const router = Router();

router.get("/invoices", listInvoices);
router.post("/invoices", createInvoice);
router.post("/invoices/:id/send", sendInvoice);
router.get("/share/:token", viewHostedInvoice);

export function createInvoice(req, res) {
  // invoice_number is assigned from a gapless sequence
}
