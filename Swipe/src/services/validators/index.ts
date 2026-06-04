import { Invoice, Product, Customer } from '../../types';

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
    } else {
      inv.confidence = 'high';
    }
  }
}

export function validateProductMath(product: Product): Product {
  const updated = { ...product };
  const unitPrice = updated.unitPrice || 0;
  const tax = updated.tax || 0;
  const expectedPriceWithTax = Math.round((unitPrice + tax) * 100) / 100;
  if (updated.priceWithTax !== null && Math.abs((updated.priceWithTax || 0) - expectedPriceWithTax) > 0.02) {
    updated.confidence = 'low';
  }
  return updated;
}

export function validateCustomerTotals(customer: Customer, invoices: Invoice[]): Customer {
  const updated = { ...customer };
  const linkedInvoices = invoices.filter(inv => inv.customerId === customer.id);
  if (linkedInvoices.length > 0) {
    const computedTotal = linkedInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    if (updated.totalPurchaseAmount === null || updated.totalPurchaseAmount === undefined) {
      updated.totalPurchaseAmount = Math.round(computedTotal * 100) / 100;
    }
  }
  return updated;
}

