export type Delay = (milliseconds: number) => Promise<void>;

const defaultDelay: Delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** 토큰별 조회 TR 간격을 보장하는 프로세스 내 요청 조절기입니다. */
export class TokenRequestPacer {
  private readonly nextAllowedAt = new Map<string, number>();

  constructor(
    private readonly minimumIntervalMs = 200,
    private readonly now: () => number = () => Date.now(),
    private readonly delay: Delay = defaultDelay,
  ) {}

  async wait(tokenKey: string): Promise<void> {
    const current = this.now();
    const scheduledAt = Math.max(current, this.nextAllowedAt.get(tokenKey) ?? current);
    this.nextAllowedAt.set(tokenKey, scheduledAt + this.minimumIntervalMs);
    const waitMs = scheduledAt - current;
    if (waitMs > 0) await this.delay(waitMs);
  }
}

export const kiwoomDomesticReadPacer = new TokenRequestPacer(200);
