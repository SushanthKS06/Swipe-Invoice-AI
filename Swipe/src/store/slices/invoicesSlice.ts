import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';
import type { Invoice } from '../../types';

export function computeInvoiceMissingFields(invoice: Invoice): string[] {
  const fieldsToCheck: Array<keyof Invoice> = [
    'serialNumber',
    'customerName',
    'productName',
    'quantity',
    'unitPrice',
    'totalAmount',
    'netAmount',
    'date',
  ];
  return fieldsToCheck.filter(f => {
    const val = invoice[f];
    return val === null || val === undefined || val === '';
  }) as string[];
}

/**
 * Re-runs the math validation check on a single invoice and updates its confidence.
 * Mirrors the logic in src/services/validators/index.ts but operates in-place on a mutable draft.
 */
function revalidateInvoiceMath(invoice: Invoice): void {
  let mathFailed = false;

  // Check 1: (qty × unitPrice) − discount ≈ netAmount
  if (invoice.quantity !== null && invoice.unitPrice !== null && invoice.netAmount !== null) {
    const grossLine = Math.round(invoice.quantity * invoice.unitPrice * 100) / 100;
    const discount = invoice.discount ?? 0;
    const expectedNet = Math.round((grossLine - discount) * 100) / 100;
    if (Math.abs(expectedNet - invoice.netAmount) > 0.05) {
      mathFailed = true;
    }
  }

  // Check 2: netAmount + taxAmount ≈ totalAmount
  if (invoice.netAmount !== null && invoice.taxAmount !== null && invoice.totalAmount !== null) {
    const expectedTotal = Math.round((invoice.netAmount + invoice.taxAmount) * 100) / 100;
    if (Math.abs(expectedTotal - invoice.totalAmount) > 0.05) {
      mathFailed = true;
    }
  }

  if (mathFailed) {
    invoice.confidence = 'low';
  } else if (invoice.confidence === 'low') {
    // Restore to medium if the user fixed the data and math now passes
    invoice.confidence = 'medium';
  }
}

/**
 * Recomputes dependent financial fields after any direct edit.
 * Order of inference (in priority):
 *   netAmount  = round((qty × unitPrice) − discount, 2)   — if qty & unitPrice are known
 *   totalAmount = round(netAmount + taxAmount, 2)           — if netAmount & taxAmount known
 *   taxPercentage = round((taxAmount / netAmount) × 100, 2) — if both known
 */
function recomputeInvoiceAmounts(invoice: Invoice): void {
  // If qty and unitPrice are both present, recompute netAmount
  if (invoice.quantity !== null && invoice.quantity !== undefined &&
      invoice.unitPrice !== null && invoice.unitPrice !== undefined) {
    const disc = invoice.discount ?? 0;
    invoice.netAmount = Math.round((invoice.quantity * invoice.unitPrice - disc) * 100) / 100;
  }

  // If netAmount and taxAmount are both present, recompute totalAmount
  if (invoice.netAmount !== null && invoice.netAmount !== undefined &&
      invoice.taxAmount !== null && invoice.taxAmount !== undefined) {
    invoice.totalAmount = Math.round((invoice.netAmount + invoice.taxAmount) * 100) / 100;
  }

  // If taxAmount and netAmount are known but taxPercentage is missing, infer it
  if ((invoice.taxPercentage === null || invoice.taxPercentage === undefined) &&
      invoice.taxAmount !== null && invoice.taxAmount !== undefined && invoice.taxAmount > 0 &&
      invoice.netAmount !== null && invoice.netAmount !== undefined && invoice.netAmount > 0) {
    invoice.taxPercentage = Math.round((invoice.taxAmount / invoice.netAmount) * 10000) / 100;
  }
  // Explicit 0% tax
  if (invoice.taxAmount === 0) {
    invoice.taxPercentage = 0;
  }
}

export const invoicesAdapter = createEntityAdapter<Invoice>();

const invoicesSlice = createSlice({
  name: 'invoices',
  initialState: invoicesAdapter.getInitialState(),
  reducers: {
    addInvoices: invoicesAdapter.addMany,
    updateInvoice(state, action: PayloadAction<{ id: string; updates: Partial<Invoice> }>) {
      invoicesAdapter.updateOne(state, {
        id: action.payload.id,
        changes: action.payload.updates,
      });

      const invoice = state.entities[action.payload.id];
      if (invoice) {
        // Recompute dependent amounts whenever any financial field changes
        const financialFields: Array<keyof Invoice> = [
          'quantity', 'unitPrice', 'discount', 'taxAmount', 'netAmount',
        ];
        const touchedFinancials = financialFields.some(f => f in action.payload.updates);
        if (touchedFinancials) {
          recomputeInvoiceAmounts(invoice as Invoice);
        }

        // Always re-run math validation so the confidence badge reflects current state
        revalidateInvoiceMath(invoice as Invoice);

        // Recompute missing fields last (after amounts may have been filled in)
        invoice.missingFields = computeInvoiceMissingFields(invoice as Invoice);
      }
    },
    cascadeProductUpdate(
      state,
      action: PayloadAction<{ productId: string; name?: string; unitPrice?: number }>
    ) {
      const { productId, name, unitPrice } = action.payload;
      Object.values(state.entities).forEach(invoice => {
        if (invoice && invoice.productId === productId) {
          if (name !== undefined) {
            invoice.productName = name;
          }
          if (unitPrice !== undefined) {
            invoice.unitPrice = unitPrice;
            // Recompute net and total amounts so invoice financials stay consistent
            // Formula: netAmount = (qty × unitPrice) − discount
            //          totalAmount = netAmount + taxAmount
            if (invoice.quantity !== null && invoice.quantity !== undefined) {
              const disc = (invoice.discount !== null && invoice.discount !== undefined) ? invoice.discount : 0;
              invoice.netAmount = Math.round((invoice.quantity * unitPrice - disc) * 100) / 100;
              const tax = (invoice.taxAmount !== null && invoice.taxAmount !== undefined) ? invoice.taxAmount : 0;
              invoice.totalAmount = Math.round((invoice.netAmount + tax) * 100) / 100;
            }
          }
          revalidateInvoiceMath(invoice as Invoice);
          invoice.missingFields = computeInvoiceMissingFields(invoice as Invoice);
        }
      });
    },
    cascadeCustomerUpdate(
      state,
      action: PayloadAction<{ customerId: string; customerName?: string }>
    ) {
      const { customerId, customerName } = action.payload;
      Object.values(state.entities).forEach(invoice => {
        if (invoice && invoice.customerId === customerId) {
          if (customerName !== undefined) {
            invoice.customerName = customerName;
          }
          invoice.missingFields = computeInvoiceMissingFields(invoice as Invoice);
        }
      });
    },
    clearAll: invoicesAdapter.removeAll,
  },
});

export const {
  addInvoices,
  updateInvoice,
  cascadeProductUpdate,
  cascadeCustomerUpdate,
  clearAll,
} = invoicesSlice.actions;

export default invoicesSlice.reducer;
