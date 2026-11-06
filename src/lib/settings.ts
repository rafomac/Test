import type { Settings } from "./types";
import { DEFAULT_THRESHOLDS } from "./engine/classify";
import { DEFAULT_WEIGHTS } from "./engine/research";

export const BENCHMARKS: { code: string; name: string; inception: string }[] = [
  { code: "IDX:NIFTY_50_TRI", name: "Nifty 50 TRI", inception: "1999-06-30" },
  { code: "IDX:NIFTY_NEXT_50_TRI", name: "Nifty Next 50 TRI", inception: "1999-06-30" },
  { code: "IDX:NIFTY_MIDCAP_150_TRI", name: "Nifty Midcap 150 TRI", inception: "2005-04-01" },
  { code: "IDX:NIFTY_SMALLCAP_250_TRI", name: "Nifty Smallcap 250 TRI", inception: "2005-04-01" },
  { code: "IDX:NIFTY_MICROCAP_250_TRI", name: "Nifty Microcap 250 TRI", inception: "2005-04-01" },
];

export const DEFAULT_SETTINGS: Settings = {
  monthlyTarget: 200_000,
  planStartMonth: "2026-11",
  monthlyTargetOverrides: {},
  targetCagrPct: 40,
  // Direct-equity targets. Large-cap is not part of the plan (0%).
  targetAllocation: { Large: 0, Mid: 20, Small: 45, Micro: 25, Nano: 10 },
  thresholds: DEFAULT_THRESHOLDS,
  positionLimits: { standardPct: 3, highPct: 5, exceptionalPct: 8, hardLimitPct: 10, initialPositionInr: 10_000 },
  sectorLimitPct: 25,
  milestones: [1_000_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000],
  numberFormat: "indian",
  // Blend reflecting target cap mix: Mid 20 → Midcap150, Small 45 → Smallcap250, Micro+Nano 35 → Microcap250
  benchmarkBlend: { "IDX:NIFTY_MIDCAP_150_TRI": 20, "IDX:NIFTY_SMALLCAP_250_TRI": 45, "IDX:NIFTY_MICROCAP_250_TRI": 35 },
  scoreWeights: DEFAULT_WEIGHTS,
  riskFreeRatePct: 6.5,
  liquidSymbols: ["LIQUIDBEES", "LIQUIDCASE", "LIQUIDETF", "LIQUIDIETF", "LIQUID1"],
  theme: "system",
  positionLimitDenominator: "directEquityCost",
  deploymentGuide: { Mid: 40_000, Small: 90_000, Micro: 50_000, Nano: 20_000 },
  alerts: {
    enabled: {},
    staleSnapshotDays: 3, stalePriceDays: 5, staleFundamentalsDays: 120,
    revenueDecelPP: 10, dilutionPct: 5, valuationChangePct: 30, scoreDropPts: 10, concentrationPct: 15, liquidityDropPct: 50,
  },
  tax: {
    residency: "NRI",
    equityLtcgMonths: 12,
    // Left blank on purpose: rates must be verified by the user for their status and year.
    stcgRatePct: null, ltcgRatePct: null, ltcgExemption: null,
    slabTaxedSymbols: ["LIQUIDBEES", "LIQUIDCASE", "LIQUIDETF", "LIQUIDIETF", "LIQUID1"],
    rulesAsOf: "",
  },
  viewMode: "simple",
};

export function mergeSettings(s: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s?.thresholds ?? {}) },
    positionLimits: { ...DEFAULT_SETTINGS.positionLimits, ...(s?.positionLimits ?? {}) },
    targetAllocation: { ...DEFAULT_SETTINGS.targetAllocation, ...(s?.targetAllocation ?? {}) },
    scoreWeights: { ...DEFAULT_SETTINGS.scoreWeights, ...(s?.scoreWeights ?? {}) },
    deploymentGuide: { ...DEFAULT_SETTINGS.deploymentGuide, ...(s?.deploymentGuide ?? {}) },
    alerts: { ...DEFAULT_SETTINGS.alerts, ...(s?.alerts ?? {}), enabled: { ...(s?.alerts?.enabled ?? {}) } },
    tax: { ...DEFAULT_SETTINGS.tax, ...(s?.tax ?? {}) },
  };
}
