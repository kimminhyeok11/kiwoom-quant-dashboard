/**
 * 포지션 사이징 유틸리티 — Kelly Criterion 기반
 *
 * Kelly 공식: f = (bp - q) / b
 *   f  = 최적 배팅 비율 (전체 자본 대비)
 *   b  = 순수익/순손실 비율 (평균 수익 / 평균 손실)
 *   p  = 승률
 *   q  = 패률 (1 - p)
 *
 * 실무에서는 Kelly의 과도한 집중 투자를 방지하기 위해:
 *   - Half Kelly (f/2): 변동성 절반 + 장기 성장률 75% 유지
 *   - Quarter Kelly (f/4): 보수적, 초보자에게 적합
 *
 * 추가 안전장치:
 *   - 최소 배팅 비율: 2% (너무 작으면 수수료만 나감)
 *   - 최대 배팅 비율: 25% (과도한 집중 방지)
 *   - 음수 Kelly는 0 반환 (해당 전략은 배팅하면 안 됨)
 */

export type PositionSizingMode = "kelly" | "half_kelly" | "quarter_kelly" | "fixed_percent";

export interface BacktestStats {
  /** 승률 (0~1, ex: 0.55 = 55%) */
  winRate: number;
  /** 평균 수익률 (양수, ex: 0.03 = 3%) */
  avgWinReturn: number;
  /** 평균 손실률 (양수, ex: 0.02 = 2%) */
  avgLossReturn: number;
}

export interface PositionSizingInput {
  mode: PositionSizingMode;
  /** fixed_percent 모드 시 사용할 비율 (1~100) */
  fixedPercent?: number;
  /** 백테스트 결과 통계 (kelly 계열 모드에서 필요) */
  stats?: BacktestStats;
  /** 현재 잔여 가용 자본 (원) */
  availableCapital: number;
  /** 종목 현재가 (원) */
  currentPrice: number;
}

export interface PositionSizingResult {
  /** 추천 배팅 비율 (0~1) */
  fractionOfCapital: number;
  /** 투자 금액 (원) */
  investmentAmount: number;
  /** 매수 수량 (주) */
  quantity: number;
  /** 사용된 Kelly 원본 비율 (디버깅용) */
  rawKellyFraction: number;
  /** 최종 적용된 비율 (clamp 후) */
  appliedFraction: number;
  /** 적용 모드 설명 */
  modeDescription: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const MIN_FRACTION = 0.02;  // 최소 2%
const MAX_FRACTION = 0.25;  // 최대 25%
const MIN_TRADES_FOR_KELLY = 10;  // Kelly 적용 최소 거래 수 (이하면 fixed 10%로 fallback)

// ─── Kelly 계산 ────────────────────────────────────────────────────────────────

/**
 * 원본 Kelly 비율 계산
 * f* = (bp - q) / b
 * b = avgWin / avgLoss (win-to-loss ratio)
 */
export function calculateKellyFraction(stats: BacktestStats): number {
  const { winRate, avgWinReturn, avgLossReturn } = stats;

  // 입력 유효성 검증
  if (winRate <= 0 || winRate >= 1) return 0;
  if (avgWinReturn <= 0 || avgLossReturn <= 0) return 0;

  const p = winRate;
  const q = 1 - p;
  const b = avgWinReturn / avgLossReturn; // odds ratio

  const kelly = (b * p - q) / b;

  // 음수면 이 전략은 손실 기대치 → 배팅하면 안 됨
  return Math.max(0, kelly);
}

/**
 * 포지션 사이징 메인 함수
 */
export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const { mode, fixedPercent, stats, availableCapital, currentPrice } = input;

  let rawKellyFraction = 0;
  let appliedFraction = 0;
  let modeDescription = "";

  if (mode === "fixed_percent") {
    // 고정 비율 모드
    const pct = Math.max(1, Math.min(100, fixedPercent ?? 10));
    appliedFraction = pct / 100;
    modeDescription = `고정 비율 ${pct}%`;
  } else {
    // Kelly 계열
    if (!stats || stats.winRate <= 0) {
      // 통계 없으면 기본 10%
      appliedFraction = 0.10;
      modeDescription = "통계 부족 → 기본 10%";
    } else {
      rawKellyFraction = calculateKellyFraction(stats);

      if (rawKellyFraction <= 0) {
        // 음수 Kelly: 이 전략은 배팅하면 안 됨
        return {
          fractionOfCapital: 0,
          investmentAmount: 0,
          quantity: 0,
          rawKellyFraction: 0,
          appliedFraction: 0,
          modeDescription: "Kelly 음수 (손실 기대) → 진입 취소",
        };
      }

      // 모드별 비율 조정
      const multiplier = mode === "kelly" ? 1.0 : mode === "half_kelly" ? 0.5 : 0.25;
      appliedFraction = rawKellyFraction * multiplier;

      const modeLabel = mode === "kelly" ? "Full Kelly" : mode === "half_kelly" ? "Half Kelly" : "Quarter Kelly";
      modeDescription = `${modeLabel} (원본 ${(rawKellyFraction * 100).toFixed(1)}% × ${multiplier})`;
    }

    // 안전 범위 클램프
    appliedFraction = Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, appliedFraction));
  }

  // 투자 금액 및 수량 계산
  const investmentAmount = Math.floor(availableCapital * appliedFraction);
  const quantity = currentPrice > 0 ? Math.floor(investmentAmount / currentPrice) : 0;

  return {
    fractionOfCapital: appliedFraction,
    investmentAmount,
    quantity,
    rawKellyFraction,
    appliedFraction,
    modeDescription,
  };
}

/**
 * 백테스트 거래 목록에서 Kelly 통계를 추출
 */
export function extractStatsFromTrades(
  trades: Array<{ returnPercent: number }>
): BacktestStats | null {
  if (trades.length < MIN_TRADES_FOR_KELLY) return null;

  const wins = trades.filter(t => t.returnPercent > 0);
  const losses = trades.filter(t => t.returnPercent <= 0);

  if (wins.length === 0 || losses.length === 0) return null;

  const winRate = wins.length / trades.length;
  const avgWinReturn = wins.reduce((s, t) => s + t.returnPercent, 0) / wins.length / 100;
  const avgLossReturn = Math.abs(losses.reduce((s, t) => s + t.returnPercent, 0) / losses.length) / 100;

  return { winRate, avgWinReturn, avgLossReturn };
}

/**
 * 포지션 사이징 모드 한국어 설명
 */
export function describeSizingMode(mode: PositionSizingMode, fixedPercent?: number): string {
  switch (mode) {
    case "kelly":
      return "Full Kelly — 수학적 최적 비율 (공격적)";
    case "half_kelly":
      return "Half Kelly — 최적의 절반 (권장, 안정적 성장)";
    case "quarter_kelly":
      return "Quarter Kelly — 최적의 1/4 (보수적)";
    case "fixed_percent":
      return `고정 ${fixedPercent ?? 10}% — 잔여 자본의 일정 비율`;
  }
}
