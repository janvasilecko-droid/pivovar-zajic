import { describe, it, expect } from 'vitest';
import { mergeDuplicateItemRows } from './orderAudit';

describe('orderAudit', () => {
  it('mergeDuplicateItemRows handles empty or single item arrays without error', async () => {
    const res1 = await mergeDuplicateItemRows([], 5);
    expect(res1.success).toBe(true);

    const res2 = await mergeDuplicateItemRows([{ id: '1', quantity: 2 }], 2);
    expect(res2.success).toBe(true);
  });
});
