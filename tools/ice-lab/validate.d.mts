// Types for validate.mjs, which stays plain JavaScript so it runs as `node validate.mjs`.

export interface TwoSidedDiagnostic {
  deviation: number;
  within: boolean;
}

export interface CaseDiagnostic {
  observable: string;
  expected: number;
  sd: number;
  unit: string;
  gated: false;
  actual: number | null;
  deviation: number | null;
  within_sd: boolean | null;
  reason?: string;
}

export interface CaseResult {
  id: string;
  kind?: string;
  role?: string;
  source?: string;
  primary_checked?: boolean | null;
  observable?: string;
  verdict: "pass" | "fail" | "unsourced" | "unmodelled";
  reason?: string;
  expected?: number;
  comparison?: string;
  tolerance?: number;
  unit?: string;
  actual?: number;
  deviation?: number;
  twoSided?: TwoSidedDiagnostic;
  diagnostics?: CaseDiagnostic[];
  divergence?: { tick: number; expected: number; actual: number };
  spec?: { verdict: string; actual: number | null; reason?: string; diagnostics?: CaseDiagnostic[] };
}

export interface FidelityReport {
  preset: string;
  reference: string;
  solver: string;
  summary: { cases: number; pass: number; fail: number; unsourced: number; unmodelled: number };
  coverage: Record<string, number>;
  gate: { no_failing_sourced: boolean; coverage_count_met: boolean; met: boolean };
  results: CaseResult[];
}

export function validateCorpus(casesDir?: string, clipsDir?: string | null): FidelityReport;

/** docs/fidelity-report.md for a report: deterministic, no clock or commit in it. */
export function markdown(report: FidelityReport): string;
