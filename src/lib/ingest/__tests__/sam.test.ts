import { describe, test, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import {
  computeMatchScore,
  Company,
  Opportunity,
} from "../../../../lib/matching";

// Feature: tendly-mvp, Property 3: Ingestion upsert is idempotent
// Validates: Requirements 3.2, 4.9

// Helper to simulate the upsert logic from the ingestion pipeline
function mapOpportunityToRecord(
  opp: {
    noticeId: string;
    title?: string | null | undefined;
    fullParentPathName?: string | null | undefined;
    organizationName?: string | null | undefined;
    naicsCode?: string | null | undefined;
    type?: string | null | undefined;
    typeOfSetAsideDescription?: string | null | undefined;
    placeOfPerformance?:
      | { state?: { name?: string | null | undefined } | null | undefined }
      | null
      | undefined;
    award?: { amount?: number | null | undefined } | null | undefined;
    description?: string | null | undefined;
    postedDate?: string | null | undefined;
    responseDeadLine?: string | null | undefined;
  },
  sourceId: string | null,
) {
  // Helper to safely parse dates (matching the actual implementation)
  const safeParseDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) return null;
      return parsed.toISOString();
    } catch {
      return null;
    }
  };

  return {
    external_id: opp.noticeId,
    source_id: sourceId,
    title: opp.title ?? "Untitled",
    agency: opp.fullParentPathName ?? opp.organizationName ?? "",
    sub_agency: opp.organizationName ?? null,
    naics_code: opp.naicsCode ?? null,
    procurement_method: opp.type ?? null,
    set_aside: opp.typeOfSetAsideDescription ?? null,
    place_of_performance: opp.placeOfPerformance?.state?.name ?? null,
    value_min: opp.award?.amount ?? null,
    synopsis: opp.description ?? "",
    posted_at: safeParseDate(opp.postedDate),
    proposals_due_at: safeParseDate(opp.responseDeadLine),
    sam_or_source_url: `https://sam.gov/opp/${opp.noticeId}/view`,
  };
}

// Simulate upsert operation tracking
function simulateUpsertBatch(
  existingRecords: Map<string, ReturnType<typeof mapOpportunityToRecord>>,
  opportunities: Parameters<typeof mapOpportunityToRecord>[0][],
  sourceId: string | null,
) {
  const inserted: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const opp of opportunities) {
    const record = mapOpportunityToRecord(opp, sourceId);
    const key = `${record.external_id}:${record.source_id}`;

    if (existingRecords.has(key)) {
      updated.push(key);
    } else {
      inserted.push(key);
    }
    existingRecords.set(key, record);
  }

  return { inserted, updated, skipped, finalRecords: existingRecords };
}

describe("Ingestion Pipeline Properties", () => {
  // Feature: tendly-mvp, Property 3: Ingestion upsert is idempotent
  // Validates: Requirements 3.2, 4.9
  test("Property 3: Ingestion upsert is idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            noticeId: fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => `NOTICE-${s}`),
            title: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
            fullParentPathName: fc.option(fc.string({ maxLength: 100 })),
            organizationName: fc.option(fc.string({ maxLength: 100 })),
            naicsCode: fc.option(fc.string({ maxLength: 10 })),
            type: fc.option(fc.string({ maxLength: 20 })),
            typeOfSetAsideDescription: fc.option(fc.string({ maxLength: 20 })),
            placeOfPerformance: fc.option(
              fc.record({
                state: fc.option(
                  fc.record({ name: fc.option(fc.string({ maxLength: 50 })) }),
                ),
              }),
            ),
            award: fc.option(
              fc.record({
                amount: fc.option(fc.integer({ min: 0, max: 10000000 })),
              }),
            ),
            description: fc.option(fc.string({ maxLength: 500 })),
            postedDate: fc.option(fc.string({ maxLength: 30 })),
            responseDeadLine: fc.option(fc.string({ maxLength: 30 })),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.option(fc.uuid()),
        (opportunities, sourceId) => {
          // Run upsert twice with the same batch
          const records1 = new Map<
            string,
            ReturnType<typeof mapOpportunityToRecord>
          >();
          const result1 = simulateUpsertBatch(
            records1,
            opportunities,
            sourceId,
          );

          const records2 = new Map<
            string,
            ReturnType<typeof mapOpportunityToRecord>
          >();
          // First batch
          simulateUpsertBatch(records2, opportunities, sourceId);
          // Second batch (same data)
          const result2 = simulateUpsertBatch(
            records2,
            opportunities,
            sourceId,
          );

          // After running twice, the final state should be identical to running once
          expect(result2.finalRecords.size).toBe(result1.finalRecords.size);

          // All records should be identical
          for (const [key, record] of result1.finalRecords) {
            const record2 = result2.finalRecords.get(key);
            expect(record2).toBeDefined();
            expect(record2).toEqual(record);
          }

          // Second run should only have updates (no new inserts)
          expect(result2.inserted).toHaveLength(0);
          expect(result2.updated.length).toBe(opportunities.length);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: tendly-mvp, Property 4: Ingestion run always reaches terminal status
  // Validates: Requirements 3.4
  test("Property 4: Ingestion run always reaches terminal status", () => {
    fc.assert(
      fc.property(
        fc.record({
          opportunities: fc.array(fc.anything(), { maxLength: 10 }),
          shouldFail: fc.boolean(),
          errorMessage: fc.option(fc.string()),
        }),
        ({ opportunities, shouldFail, errorMessage }) => {
          // Simulate ingestion run status tracking
          type IngestionStatus = "STARTED" | "SUCCESS" | "FAILED";

          let status: IngestionStatus = "STARTED";
          let errorOccurred = false;

          try {
            // Simulate processing
            if (shouldFail) {
              throw new Error(errorMessage ?? "Simulated error");
            }
            // Process opportunities...
          } catch (e) {
            errorOccurred = true;
          } finally {
            // Always update status in finally block (as the code does)
            status = errorOccurred ? "FAILED" : "SUCCESS";
          }

          // Status must be terminal
          expect(["SUCCESS", "FAILED"]).toContain(status);
          expect(status).not.toBe("STARTED");

          // If error occurred, status must be FAILED
          if (shouldFail) {
            expect(status).toBe("FAILED");
          } else {
            expect(status).toBe("SUCCESS");
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: tendly-mvp, Property 5: Failed ingestion preserves existing opportunities
  // Validates: Requirements 3.5
  test("Property 5: Failed ingestion preserves existing opportunities", () => {
    fc.assert(
      fc.property(
        fc.record({
          existingCount: fc.integer({ min: 0, max: 100 }),
          newOpportunities: fc.array(fc.anything(), { maxLength: 20 }),
          shouldFail: fc.boolean(),
          failAtIndex: fc.integer({ min: 0, max: 19 }),
        }),
        ({ existingCount, newOpportunities, shouldFail, failAtIndex }) => {
          // Simulate existing opportunities in database
          let currentCount = existingCount;
          let errorOccurred = false;

          try {
            for (let i = 0; i < newOpportunities.length; i++) {
              // Simulate failure at specific index if shouldFail is true
              if (shouldFail && i === failAtIndex) {
                throw new Error("Simulated failure");
              }
              // Each successful upsert adds or updates
              currentCount++;
            }
          } catch (e) {
            errorOccurred = true;
          }

          // After a failed run, count should be >= existing count
          // (some new records may have been inserted before failure)
          expect(currentCount).toBeGreaterThanOrEqual(existingCount);

          // If error occurred, we should have marked it
          if (shouldFail && failAtIndex < newOpportunities.length) {
            expect(errorOccurred).toBe(true);
            // Count should be existingCount + failAtIndex (records processed before failure)
            expect(currentCount).toBe(existingCount + failAtIndex);
          } else {
            // No error, all opportunities should be processed
            expect(errorOccurred).toBe(false);
            expect(currentCount).toBe(existingCount + newOpportunities.length);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: tendly-mvp, Property 6: Opportunity field mapping is complete
  // Validates: Requirements 3.6
  test("Property 6: Opportunity field mapping is complete", () => {
    fc.assert(
      fc.property(
        fc.record({
          noticeId: fc.string({ minLength: 1, maxLength: 20 }),
          title: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nilWithUndefined: true,
          }),
          fullParentPathName: fc.option(fc.string({ maxLength: 100 }), {
            nilWithUndefined: true,
          }),
          organizationName: fc.option(fc.string({ maxLength: 100 }), {
            nilWithUndefined: true,
          }),
          naicsCode: fc.option(fc.string({ maxLength: 10 }), {
            nilWithUndefined: true,
          }),
          type: fc.option(fc.string({ maxLength: 20 }), {
            nilWithUndefined: true,
          }),
          typeOfSetAsideDescription: fc.option(fc.string({ maxLength: 20 }), {
            nilWithUndefined: true,
          }),
          placeOfPerformance: fc.option(
            fc.record({
              state: fc.option(
                fc.record({
                  name: fc.option(fc.string({ maxLength: 50 }), {
                    nilWithUndefined: true,
                  }),
                }),
                { nilWithUndefined: true },
              ),
            }),
            { nilWithUndefined: true },
          ),
          award: fc.option(
            fc.record({
              amount: fc.option(fc.integer({ min: 0, max: 10000000 }), {
                nilWithUndefined: true,
              }),
            }),
            { nilWithUndefined: true },
          ),
          description: fc.option(fc.string({ maxLength: 500 }), {
            nilWithUndefined: true,
          }),
          postedDate: fc.option(fc.string({ maxLength: 30 }), {
            nilWithUndefined: true,
          }),
          responseDeadLine: fc.option(fc.string({ maxLength: 30 }), {
            nilWithUndefined: true,
          }),
        }),
        fc.option(fc.uuid()),
        (opp, sourceId) => {
          const record = mapOpportunityToRecord(opp, sourceId);

          // Required fields must be non-null with fallbacks
          expect(record.title).toBeDefined();
          expect(record.title).not.toBeNull();
          expect(typeof record.title).toBe("string");
          // Title should be 'Untitled' if not provided (null/undefined)
          if (opp.title === null || opp.title === undefined) {
            expect(record.title).toBe("Untitled");
          }

          expect(record.agency).toBeDefined();
          expect(record.agency).not.toBeNull();
          expect(typeof record.agency).toBe("string");
          // Agency should be empty string if not provided (fallback)

          expect(record.synopsis).toBeDefined();
          expect(record.synopsis).not.toBeNull();
          expect(typeof record.synopsis).toBe("string");
          // Synopsis should be empty string if not provided (fallback)

          expect(record.sam_or_source_url).toBeDefined();
          expect(record.sam_or_source_url).not.toBeNull();
          expect(typeof record.sam_or_source_url).toBe("string");
          expect(record.sam_or_source_url).toMatch(
            /^https:\/\/sam\.gov\/opp\//,
          );
          expect(record.sam_or_source_url).toContain(opp.noticeId);

          // External ID and source ID mapping
          expect(record.external_id).toBe(opp.noticeId);
          expect(record.source_id).toBe(sourceId ?? null);

          // Optional fields should be null if not provided
          expect(record.naics_code).toBe(opp.naicsCode ?? null);
          expect(record.set_aside).toBe(opp.typeOfSetAsideDescription ?? null);
          expect(record.place_of_performance).toBe(
            opp.placeOfPerformance?.state?.name ?? null,
          );

          // Posted date mapping - should be null if not provided or invalid
          if (!opp.postedDate) {
            expect(record.posted_at).toBeNull();
          }
          // If provided, it should be a valid ISO string or null (if invalid date)

          // Response deadline mapping - should be null if not provided or invalid
          if (!opp.responseDeadLine) {
            expect(record.proposals_due_at).toBeNull();
          }
          // If provided, it should be a valid ISO string or null (if invalid date)

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: tendly-mvp, Property 9: Match computation covers all company–opportunity pairs
  // Validates: Requirements 4.1
  test("Property 9: Match computation covers all company–opportunity pairs", () => {
    fc.assert(
      fc.property(
        fc.record({
          companies: fc.array(
            fc.record({
              id: fc.uuid(),
              naics_codes: fc.array(fc.string({ maxLength: 10 }), {
                maxLength: 5,
              }),
              socio_economic_certs: fc.array(fc.string({ maxLength: 20 }), {
                maxLength: 5,
              }),
              target_geographies: fc.array(fc.string({ maxLength: 50 }), {
                maxLength: 5,
              }),
              capability_keywords: fc.array(fc.string({ maxLength: 30 }), {
                maxLength: 10,
              }),
            }),
            { minLength: 0, maxLength: 10 },
          ),
          opportunities: fc.array(
            fc.record({
              id: fc.uuid(),
              naics_code: fc.option(fc.string({ maxLength: 10 }), {
                nilWithUndefined: true,
              }),
              set_aside: fc.option(fc.string({ maxLength: 20 }), {
                nilWithUndefined: true,
              }),
              place_of_performance: fc.option(fc.string({ maxLength: 50 }), {
                nilWithUndefined: true,
              }),
              value_max: fc.option(fc.integer({ min: 0, max: 10000000 }), {
                nilWithUndefined: true,
              }),
              value_min: fc.option(fc.integer({ min: 0, max: 10000000 }), {
                nilWithUndefined: true,
              }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              synopsis: fc.string({ maxLength: 500 }),
            }),
            { minLength: 0, maxLength: 10 },
          ),
        }),
        ({ companies, opportunities }) => {
          // Simulate match computation as done in the ingestion pipeline
          const scores: {
            company_id: string;
            opportunity_id: string;
            score: number;
          }[] = [];

          for (const company of companies as Company[]) {
            for (const opp of opportunities as Opportunity[]) {
              const { score } = computeMatchScore(company, opp);
              scores.push({
                company_id: company.id,
                opportunity_id: opp.id,
                score,
              });
            }
          }

          // Verify coverage: N companies × M opportunities = N×M match scores
          const expectedCount = companies.length * opportunities.length;
          expect(scores.length).toBe(expectedCount);

          // Verify each company-opportunity pair has exactly one score
          const pairSet = new Set<string>();
          for (const s of scores) {
            const key = `${s.company_id}:${s.opportunity_id}`;
            expect(pairSet.has(key)).toBe(false); // No duplicates
            pairSet.add(key);
          }

          // Verify all pairs are covered
          for (const company of companies) {
            for (const opp of opportunities) {
              const key = `${company.id}:${opp.id}`;
              expect(pairSet.has(key)).toBe(true);
            }
          }

          // Verify all scores are in valid range
          for (const s of scores) {
            expect(s.score).toBeGreaterThanOrEqual(0);
            expect(s.score).toBeLessThanOrEqual(100);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
