import { describe, expect, it } from 'vitest';
import { CATALOG_QUERY_KEYS } from '../src/lib/catalogApi';

describe('Phase 1B.2 Parts and Geography Query Keys', () => {
  it('generates consistent query keys for HSN / Tax master', () => {
    const defaultKey = CATALOG_QUERY_KEYS.hsnList();
    expect(defaultKey).toEqual(['catalog', 'hsn', undefined]);

    const params = { page: 1, limit: 20, search: '8415', isActive: 'Y' as const };
    const filteredKey = CATALOG_QUERY_KEYS.hsnList(params);
    expect(filteredKey).toEqual(['catalog', 'hsn', params]);

    const singleKey = CATALOG_QUERY_KEYS.hsn('hsn-uuid-1');
    expect(singleKey).toEqual(['catalog', 'hsn', 'hsn-uuid-1']);
  });

  it('generates consistent query keys for Part Codes master', () => {
    const defaultKey = CATALOG_QUERY_KEYS.parts();
    expect(defaultKey).toEqual(['catalog', 'parts', undefined]);

    const params = { brandId: 'brd-1', category: 'SPARE', page: 1, limit: 15 };
    const filteredKey = CATALOG_QUERY_KEYS.parts(params);
    expect(filteredKey).toEqual(['catalog', 'parts', params]);

    const singleKey = CATALOG_QUERY_KEYS.part('part-uuid-1');
    expect(singleKey).toEqual(['catalog', 'part', 'part-uuid-1']);
  });

  it('generates consistent query keys for States and Cities', () => {
    const statesKey = CATALOG_QUERY_KEYS.states({ zone: 'WEST' });
    expect(statesKey).toEqual(['geography', 'states', { zone: 'WEST' }]);

    const stateDetailKey = CATALOG_QUERY_KEYS.state('st-1');
    expect(stateDetailKey).toEqual(['geography', 'state', 'st-1']);

    const citiesKey = CATALOG_QUERY_KEYS.cities({ stateId: 'st-1' });
    expect(citiesKey).toEqual(['geography', 'cities', { stateId: 'st-1' }]);

    const cityDetailKey = CATALOG_QUERY_KEYS.city('ct-1');
    expect(cityDetailKey).toEqual(['geography', 'city', 'ct-1']);
  });

  it('generates consistent query keys for Pincodes, Lookups, and Locations', () => {
    const pincodesKey = CATALOG_QUERY_KEYS.pincodes({ stateId: 'st-1', isServiceable: 'Y' });
    expect(pincodesKey).toEqual(['geography', 'pincodes', { stateId: 'st-1', isServiceable: 'Y' }]);

    const lookupKey = CATALOG_QUERY_KEYS.pincodeLookup('400001');
    expect(lookupKey).toEqual(['geography', 'pincodeLookup', '400001']);

    const singlePincodeKey = CATALOG_QUERY_KEYS.pincode('pin-1');
    expect(singlePincodeKey).toEqual(['geography', 'pincode', 'pin-1']);

    const locationsKey = CATALOG_QUERY_KEYS.locations({ partyType: 'ASF' });
    expect(locationsKey).toEqual(['geography', 'locations', { partyType: 'ASF' }]);
  });
});
