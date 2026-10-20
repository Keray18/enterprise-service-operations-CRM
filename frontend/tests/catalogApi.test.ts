import { describe, expect, it } from 'vitest';
import { CATALOG_QUERY_KEYS } from '../src/lib/catalogApi';

describe('Catalog Master API and Query Keys', () => {
  it('generates consistent TanStack Query keys for brands', () => {
    const keyAll = CATALOG_QUERY_KEYS.brands();
    expect(keyAll).toEqual(['catalog', 'brands', undefined]);

    const params = { page: 1, limit: 10, search: 'SKC', isActive: 'Y' as const };
    const keyFiltered = CATALOG_QUERY_KEYS.brands(params);
    expect(keyFiltered).toEqual(['catalog', 'brands', params]);

    const singleKey = CATALOG_QUERY_KEYS.brand('test-uuid');
    expect(singleKey).toEqual(['catalog', 'brand', 'test-uuid']);
  });

  it('generates consistent TanStack Query keys for products and categories', () => {
    const keyAll = CATALOG_QUERY_KEYS.products();
    expect(keyAll).toEqual(['catalog', 'products', undefined]);

    const catKey = CATALOG_QUERY_KEYS.categories();
    expect(catKey).toEqual(['catalog', 'categories']);

    const prodKey = CATALOG_QUERY_KEYS.product('prod-123');
    expect(prodKey).toEqual(['catalog', 'product', 'prod-123']);
  });

  it('generates consistent TanStack Query keys for models', () => {
    const params = { brandId: 'b-1', productId: 'p-1', page: 2 };
    const modelKey = CATALOG_QUERY_KEYS.models(params);
    expect(modelKey).toEqual(['catalog', 'models', params]);

    const singleModel = CATALOG_QUERY_KEYS.model('m-123');
    expect(singleModel).toEqual(['catalog', 'model', 'm-123']);
  });

  it('generates consistent TanStack Query keys for audit logs', () => {
    const auditKey = CATALOG_QUERY_KEYS.audit({ entityName: 'BRAND' });
    expect(auditKey).toEqual(['catalog', 'audit', { entityName: 'BRAND' }]);
  });
});
