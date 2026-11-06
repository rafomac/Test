/**
 * Small/micro/nano-cap liquidity analysis. Uses only imported price/volume history and optional
 * security-master metadata (free float, SME lot size, spread, delivery %, circuit hits, suspensions).
 * Market value is never assumed to be realisable: exit scenarios are conservative.
 */
import type { PricePoint, Security } from "../types";

export interface LiquidityProfile {
  symbol: string;
  bars: number;
  adtv20: number | null; // ₹ average daily traded value, 20 sessions
  adtv120: number | null;
  advVolume20: number | null; // shares
  zeroVolumeDays90: number | null;
  deterioration: number | null; // adtv20 / adtv120 − 1
  freeFloatMcapCr: number | null;
  spreadPct: number | null;
  deliveryPct: number | null;
  circuitHits90d: number | null;
  suspended: boolean;
  isSME: boolean;
  minLotValue: number | null; // SME lot size × price
  smeBlocksInitialRule: boolean; // min lot > initial position size
  score: number | null; // 0 (illiquid) … 100 (liquid)
  scoreBasis: string[];
  exits: { participation: number; days: number | null; impactPct: number | null; realisable: number | null }[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/**
 * Exit days = position value ÷ (participation × ADTV). Price impact uses a square-root model
 * impact ≈ k × σ_daily × sqrt(Q/ADV) with k = 1 and σ from the last 60 returns — an ESTIMATE.
 * Spread cost (half-spread) is added when known.
 */
export function liquidityProfile(symbol: string, prices: PricePoint[], sec: Security | undefined, positionValue: number, initialPosition: number): LiquidityProfile {
  const ps = prices.filter((p) => p.symbol === symbol).sort((a, b) => (a.date < b.date ? -1 : 1));
  const withVol = ps.filter((p) => p.volume !== undefined);
  const last = ps[ps.length - 1];
  const tv = (xs: PricePoint[]) => (xs.length ? mean(xs.map((p) => p.close * (p.volume ?? 0))) : NaN);
  const adtv20 = withVol.length >= 10 ? tv(withVol.slice(-20)) : null;
  const adtv120 = withVol.length >= 60 ? tv(withVol.slice(-120)) : null;
  const advVolume20 = withVol.length >= 10 ? mean(withVol.slice(-20).map((p) => p.volume!)) : null;
  const zero90 = withVol.length >= 30 ? withVol.slice(-90).filter((p) => (p.volume ?? 0) === 0).length : null;
  const rets = ps.slice(-61).map((p, i, a) => (i ? Math.log(p.close / a[i - 1].close) : null)).filter((x): x is number => x !== null);
  const sigma = rets.length >= 20 ? Math.sqrt(rets.reduce((s, r) => s + r * r, 0) / rets.length) : null;
  const spread = sec?.bidAskSpreadPct ?? null;
  const exits = [0.05, 0.1, 0.2].map((part) => {
    if (!adtv20 || adtv20 <= 0) return { participation: part, days: null, impactPct: null, realisable: null };
    const days = positionValue / (part * adtv20);
    const impact = sigma !== null ? Math.min(0.5, sigma * Math.sqrt(part) + (spread ?? 0) / 200) : null;
    return { participation: part, days, impactPct: impact, realisable: impact !== null ? positionValue * (1 - impact) : null };
  });
  const basis: string[] = [];
  let score: number | null = null;
  if (adtv20 !== null) {
    // Turnover component (log-scaled: ₹1 lakh/day → 0, ₹10 cr/day → 60)
    const t = Math.max(0, Math.min(60, (Math.log10(Math.max(adtv20, 1)) - 5) * 20));
    let sc = t;
    basis.push(`ADTV ₹${Math.round(adtv20).toLocaleString("en-IN")} → ${t.toFixed(0)}/60`);
    const d10 = exits[1].days;
    if (d10 !== null) { const c = d10 <= 1 ? 20 : d10 <= 5 ? 15 : d10 <= 20 ? 8 : 0; sc += c; basis.push(`Exit at 10% ADTV ≈ ${d10.toFixed(1)} days → ${c}/20`); }
    if (zero90 !== null) { const c = zero90 === 0 ? 10 : zero90 <= 5 ? 5 : 0; sc += c; basis.push(`${zero90} no-trade days in 90 → ${c}/10`); }
    if (spread !== null) { const c = spread <= 0.5 ? 10 : spread <= 2 ? 5 : 0; sc += c; basis.push(`Spread ${spread}% → ${c}/10`); } else { sc += 5; basis.push("Spread unknown → neutral 5/10"); }
    if ((sec?.circuitHits90d ?? 0) > 5) { sc -= 10; basis.push(`${sec!.circuitHits90d} circuit hits in 90 days → −10`); }
    if (sec?.suspensions?.length) { sc -= 20; basis.push("Trading suspension history → −20"); }
    score = Math.max(0, Math.min(100, sc));
  } else basis.push("No volume history imported — liquidity unknown (not assumed liquid).");
  const minLot = sec?.isSME && sec.lotSize && last ? sec.lotSize * last.close : null;
  return {
    symbol, bars: ps.length, adtv20, adtv120, advVolume20, zeroVolumeDays90: zero90,
    deterioration: adtv20 && adtv120 ? adtv20 / adtv120 - 1 : null,
    freeFloatMcapCr: sec?.freeFloatPct !== undefined && sec.marketCapCr !== undefined ? (sec.marketCapCr * sec.freeFloatPct) / 100 : null,
    spreadPct: spread, deliveryPct: sec?.deliveryPct ?? null, circuitHits90d: sec?.circuitHits90d ?? null,
    suspended: !!sec?.suspensions?.length, isSME: !!sec?.isSME, minLotValue: minLot,
    smeBlocksInitialRule: minLot !== null && minLot > initialPosition,
    score, scoreBasis: basis, exits,
  };
}
