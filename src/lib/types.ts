/**
 * Core domain model. All monetary values are in INR (rupees, not paise).
 * All dates are ISO "YYYY-MM-DD" strings in IST calendar terms.
 */

export type AssetType = "STOCK" | "ETF" | "MF" | "CASH_EQUIVALENT";

/** Data-quality provenance attached to every record and derived metric. */
export type DataQuality = "VERIFIED" | "RECONSTRUCTED" | "ESTIMATED" | "MISSING" | "SYNTHETIC";

export type DataSource =
  | "KITE_API"
  | "CONSOLE_TRADEBOOK"
  | "CONSOLE_HOLDINGS"
  | "CONSOLE_LEDGER"
  | "CONSOLE_DIVIDENDS"
  | "CONSOLE_PNL"
  | "KITE_HOLDINGS_CSV"
  | "COIN_MF"
  | "MANUAL"
  | "CSV_IMPORT"
  | "SYNTHETIC_SAMPLE";

export interface Security {
  symbol: string; // tradingsymbol, e.g. "INFY", or MF fund name key
  isin?: string;
  name?: string;
  exchange?: string;
  assetType: AssetType;
  sector?: string;
  industry?: string;
  /** Full market capitalisation in ₹ crore. */
  marketCapCr?: number;
  marketCapAsOf?: string;
  /** Official AMFI half-yearly rank (1 = largest). */
  amfiRank?: number;
  amfiCategory?: "Large" | "Mid" | "Small";
  amfiListDate?: string;
  /** For ETFs/MFs: look-through category weights if known (fractions summing to 1). */
  lookThrough?: Partial<Record<CapCategory | "Cash" | "Debt" | "Other", number>>;
  source: DataSource;
  updatedAt: string;
}

export type CapCategory = "Large" | "Mid" | "Small" | "Micro" | "Nano" | "Unclassified";

export interface Trade {
  id: string;
  date: string;
  symbol: string;
  isin?: string;
  exchange?: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  /** Brokerage + STT + exchange + GST + SEBI + stamp duty, if known. */
  charges: number;
  chargesKnown: boolean;
  tradeId?: string;
  orderId?: string;
  source: DataSource;
  quality: DataQuality;
}

export type CashKind =
  | "DEPOSIT" // external money in (funds added)
  | "WITHDRAWAL" // external money out (payout)
  | "DIVIDEND"
  | "CHARGE" // DP charges, AMC, etc. not tied to a trade
  | "INTEREST"
  | "OTHER";

export interface CashEntry {
  id: string;
  date: string;
  kind: CashKind;
  /** Always positive; direction is implied by kind. */
  amount: number;
  symbol?: string;
  description?: string;
  source: DataSource;
  quality: DataQuality;
}

export type CorporateActionKind = "SPLIT" | "BONUS" | "MERGER" | "DEMERGER" | "SYMBOL_CHANGE";

export interface CorporateAction {
  id: string;
  symbol: string;
  exDate: string;
  kind: CorporateActionKind;
  /**
   * SPLIT: old shares `ratioFrom` -> new shares `ratioTo` (e.g. 1:5 split = 1 -> 5).
   * BONUS: `ratioTo` bonus shares for every `ratioFrom` held (e.g. 1:1 bonus = 1,1).
   * MERGER / SYMBOL_CHANGE: each `ratioFrom` old shares become `ratioTo` shares of `newSymbol`.
   * DEMERGER: holders get `ratioTo` shares of `newSymbol` per `ratioFrom` held, and
   *           `costAllocationPct` of cost moves to the new entity.
   */
  ratioFrom: number;
  ratioTo: number;
  newSymbol?: string;
  costAllocationPct?: number;
  notes?: string;
  source: DataSource;
}

export interface PricePoint {
  symbol: string; // security symbol or "IDX:<code>" for benchmark indices
  date: string;
  close: number;
  volume?: number;
  source: DataSource;
}

export interface SnapshotItem {
  symbol: string;
  isin?: string;
  exchange?: string;
  assetType: AssetType;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  /** Kite-reported realised P&L, when available. */
  pnl?: number;
  sector?: string;
}

/** Immutable point-in-time holdings record (from Kite API or Console export). */
export interface HoldingsSnapshot {
  id: string;
  takenAt: string; // ISO timestamp
  asOfDate: string; // trading date the prices refer to
  source: DataSource;
  quality: DataQuality;
  items: SnapshotItem[];
  /** Available equity cash from Kite margins (net available), if fetched. */
  cash?: number;
}

export type Conviction = "Research" | "Standard" | "High" | "Exceptional";

export interface Socials {
  platform: "LinkedIn" | "X" | "Instagram" | "Facebook" | "YouTube" | "Other";
  url: string;
  verifiedOfficial: boolean;
  postsLast90d?: number;
  lastPostDate?: string;
  followers?: number;
}

/** Company fundamentals. Every field optional: missing means *unknown*, never zero. */
export interface Fundamentals {
  symbol: string;
  asOf: string;
  source: string; // free text e.g. "Screener.in export 2026-10-30", "Annual report FY26"
  /** Fiscal-year revenue (₹ cr), keyed "FY2016".."FY2026". */
  revenueAnnual?: Record<string, number>;
  /** Quarterly revenue (₹ cr), keyed "2026Q2" etc (calendar quarters of results). */
  revenueQuarterly?: Record<string, number>;
  netProfitAnnual?: Record<string, number>;
  ttmRevenue?: number;
  ttmNetProfit?: number;
  operatingMarginPct?: number;
  ebitdaMarginPct?: number;
  netMarginPct?: number;
  roePct?: number;
  rocePct?: number;
  roicPct?: number;
  totalDebtCr?: number;
  cashCr?: number;
  debtToEquity?: number;
  interestCoverage?: number;
  operatingCashFlowCr?: number;
  freeCashFlowCr?: number;
  capexCr?: number;
  pe?: number;
  forwardPe?: number;
  priceToSales?: number;
  evToSales?: number;
  evToEbitda?: number;
  priceToBook?: number;
  epsGrowth3yPct?: number;
  promoterHoldingPct?: number;
  /** Pledged shares as % of PROMOTER holding (not of total equity). */
  promoterPledgePctOfPromoter?: number;
  /** Pledged shares as % of total equity, if that is what the source reports. */
  promoterPledgePctOfTotal?: number;
  /** Promoter holding history keyed by quarter "2025Q4" -> %. */
  promoterHistory?: Record<string, number>;
  governanceFlags?: string[];
  website?: string;
  websiteQuality?: 0 | 1 | 2 | 3; // 0 none/broken .. 3 professional
  socials?: Socials[];
}

export type SlowdownCause = "Temporary" | "Cyclical" | "Structural" | "Company-specific" | "Unexplained" | "Not applicable";

export interface ResearchEntry {
  symbol: string;
  conviction: Conviction;
  /** Analyst/user ratings 0–10 per category. undefined = not assessed. */
  ratings: Partial<Record<ScoreCategory, number>>;
  /** Whether each rating is backed by verified evidence. */
  evidence: Partial<Record<ScoreCategory, "verified" | "interpretation" | "user">>;
  thesis?: string;
  opportunities?: string;
  risks?: string;
  notes?: string;
  slowdownCause?: SlowdownCause;
  slowdownEvidence?: string;
  lastReviewed?: string;
  nextReview?: string;
  updatedAt: string;
}

export type ScoreCategory =
  | "growth"
  | "financialHealth"
  | "valuation"
  | "governance"
  | "competitive"
  | "industry"
  | "digital";

export interface MarketCapThresholds {
  /** If AMFI rank is present, it is authoritative for Large/Mid/Small. */
  useAmfiRank: boolean;
  largeMaxRank: number; // 100
  midMaxRank: number; // 250
  /** Fallback ₹cr thresholds when no AMFI rank (approximate; must be refreshed each half-year). */
  largeMinCr: number;
  midMinCr: number;
  /** Custom subdivisions of the official Small-cap bucket (₹cr). Exclusive: Small >= microMaxCr > Micro >= nanoMaxCr > Nano. */
  microMaxCr: number;
  nanoMaxCr: number;
}

export interface PositionLimits {
  standardPct: number;
  highPct: number;
  exceptionalPct: number;
  hardLimitPct: number;
  initialPositionInr: number;
}

export interface Settings {
  monthlyTarget: number;
  /** First month (YYYY-MM) the SIP commitment applies. Earlier months are not judged. */
  planStartMonth: string;
  /** Per-month overrides of the target (YYYY-MM -> ₹). */
  monthlyTargetOverrides: Record<string, number>;
  targetCagrPct: number;
  targetAllocation: Record<"Mid" | "Small" | "Micro" | "Nano", number> & { Large?: number };
  thresholds: MarketCapThresholds;
  positionLimits: PositionLimits;
  sectorLimitPct: number;
  milestones: number[];
  numberFormat: "indian" | "international";
  benchmarkBlend: Record<string, number>; // "IDX:NIFTY_SMALLCAP_250_TRI" -> weight
  scoreWeights: Record<ScoreCategory, number>;
  riskFreeRatePct: number;
  liquidSymbols: string[];
  theme: "dark" | "light" | "system";
}

export interface ImportLog {
  id: string;
  at: string;
  kind: string;
  fileName: string;
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  duplicates: number;
  warnings: string[];
}

export interface Conflict {
  id: string;
  at: string;
  entity: string;
  key: string;
  existing: unknown;
  incoming: unknown;
  status: "open" | "kept-existing" | "accepted-incoming";
}
