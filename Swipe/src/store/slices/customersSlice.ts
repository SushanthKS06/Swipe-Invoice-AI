import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';
import type { Customer } from '../../types';

export function computeCustomerMissingFields(customer: Customer): string[] {
  const fieldsToCheck: Array<keyof Customer> = [
    'customerName',
    'phoneNumber',
    'email',
    'address',
    'totalPurchaseAmount',
  ];
  return fieldsToCheck.filter(f => {
    const val = customer[f];
    return val === null || val === undefined || val === '';
  }) as string[];
}

export const customersAdapter = createEntityAdapter<Customer>();

const customersSlice = createSlice({
  name: 'customers',
  initialState: customersAdapter.getInitialState(),
  reducers: {
    addCustomers(state, action: PayloadAction<Customer[]>) {
      const existingCustomers = Object.values(state.entities) as Customer[];

      for (const newCustomer of action.payload) {
        const newName = (newCustomer.customerName || '').trim().toLowerCase();

        const match = newName ? existingCustomers.find(
          c => (c.customerName || '').trim().toLowerCase() === newName
        ) : undefined;

        if (match) {
          const sumAmt = ((match.totalPurchaseAmount || 0) + (newCustomer.totalPurchaseAmount || 0));

          // Backfill any contact fields the existing record is missing from the new record
          const changes: Partial<Customer> = {
            totalPurchaseAmount: Math.round(sumAmt * 100) / 100,
          };
          if (!match.phoneNumber && newCustomer.phoneNumber) changes.phoneNumber = newCustomer.phoneNumber;
          if (!match.email && newCustomer.email) changes.email = newCustomer.email;
          if (!match.address && newCustomer.address) changes.address = newCustomer.address;
          if (!match.balanceDue && newCustomer.balanceDue) changes.balanceDue = newCustomer.balanceDue;

          customersAdapter.updateOne(state, { id: match.id, changes });

          // Recompute missingFields after merge so banner count stays accurate
          const updated = state.entities[match.id];
          if (updated) {
            updated.missingFields = computeCustomerMissingFields(updated as Customer);
          }
        } else {
          customersAdapter.addOne(state, newCustomer);
        }
      }
    },
    updateCustomer(state, action: PayloadAction<{ id: string; updates: Partial<Customer> }>) {
      customersAdapter.updateOne(state, {
        id: action.payload.id,
        changes: action.payload.updates,
      });
      // Recompute missing fields dynamically
      const customer = state.entities[action.payload.id];
      if (customer) {
        customer.missingFields = computeCustomerMissingFields(customer as Customer);
      }
    },
    clearAll: customersAdapter.removeAll,
  },
});

export const { addCustomers, updateCustomer, clearAll } = customersSlice.actions;

export default customersSlice.reducer;
