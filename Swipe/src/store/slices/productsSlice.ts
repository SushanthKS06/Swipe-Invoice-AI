import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';
import type { Product } from '../../types';

export function computeProductMissingFields(product: Product): string[] {
  // 'discount' is intentionally excluded — it is optional on products.
  // Including it would flag every non-discounted product as having a missing field.
  const fieldsToCheck: Array<keyof Product> = [
    'name',
    'quantity',
    'unitPrice',
    'tax',
    'taxPercentage',
    'priceWithTax',
  ];
  return fieldsToCheck.filter(f => {
    const val = product[f];
    return val === null || val === undefined || val === '';
  }) as string[];
}

export const productsAdapter = createEntityAdapter<Product>();

const productsSlice = createSlice({
  name: 'products',
  initialState: productsAdapter.getInitialState(),
  reducers: {
    addProducts(state, action: PayloadAction<Product[]>) {
      const existingProducts = Object.values(state.entities) as Product[];

      for (const newProduct of action.payload) {
        const newName = (newProduct.name || '').trim().toLowerCase();
        
        const match = newName ? existingProducts.find(
          p => (p.name || '').trim().toLowerCase() === newName
        ) : undefined;
        
        if (match) {
          const sumQty = ((match.quantity || 0) + (newProduct.quantity || 0));
          const sumTax = Math.round(((match.tax || 0) + (newProduct.tax || 0)) * 100) / 100;
          // priceWithTax = unit price + per-unit tax. Per-unit tax = sumTax / sumQty.
          // This keeps priceWithTax dimensionally correct (per unit, not aggregate).
          const perUnitTax = sumQty > 0 ? sumTax / sumQty : 0;
          const newPriceWithTax = match.unitPrice !== null
            ? Math.round((match.unitPrice + perUnitTax) * 100) / 100
            : null;

          productsAdapter.updateOne(state, {
            id: match.id,
            changes: {
              quantity: Math.round(sumQty * 100) / 100,
              tax: sumTax,
              priceWithTax: newPriceWithTax !== null ? newPriceWithTax : match.priceWithTax
            }
          });
          
          // Recompute missingFields after merge so banner count stays accurate
          const updated = state.entities[match.id];
          if (updated) {
            updated.missingFields = computeProductMissingFields(updated as Product);
          }
        } else {
          productsAdapter.addOne(state, newProduct);
        }
      }
    },
    updateProduct(state, action: PayloadAction<{ id: string; updates: Partial<Product> }>) {
      productsAdapter.updateOne(state, {
        id: action.payload.id,
        changes: action.payload.updates,
      });
      // Recompute missing fields dynamically
      const product = state.entities[action.payload.id];
      if (product) {
        product.missingFields = computeProductMissingFields(product as Product);
      }
    },
    clearAll: productsAdapter.removeAll,
  },
});

export const { addProducts, updateProduct, clearAll } = productsSlice.actions;

export default productsSlice.reducer;
