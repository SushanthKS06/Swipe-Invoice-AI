import { Invoice } from '../../types';

export function validateExtractionMath(invoices: Invoice[]): void {
  for (const inv of invoices) {
    let mathFailed = false;

    // Check 1: (quantity * unitPrice) - discount ≈ netAmount
    // Discount is subtracted from the gross line total to arrive at the net amount.
    if (inv.quantity !== null && inv.unitPrice !== null && inv.netAmount !== null) {
      const grossLine = Math.round(inv.quantity * inv.unitPrice * 100) / 100;
      const discount = inv.discount !== null && inv.discount !== undefined ? inv.discount : 0;
      const expectedNet = Math.round((grossLine - discount) * 100) / 100;
      if (Math.abs(expectedNet - inv.netAmount) > 0.05) {
        mathFailed = true;
      }
    }

    // Check 2: netAmount + taxAmount ≈ totalAmount
    if (inv.netAmount !== null && inv.taxAmount !== null && inv.totalAmount !== null) {
      const expectedTotal = Math.round((inv.netAmount + inv.taxAmount) * 100) / 100;
      if (Math.abs(expectedTotal - inv.totalAmount) > 0.05) {
        mathFailed = true;
      }
    }

    if (mathFailed) {
      inv.confidence = 'low';
    }
  }
}

