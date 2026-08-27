/**
 * 텔레그램 알림 시스템
 *
 * 모의투자 체결, 일간 보고서, 시스템 알림을 텔레그램으로 전송.
 *
 * 환경변수:
 * - TELEGRAM_BOT_TOKEN: 텔레그램 봇 토큰 (@BotFather에서 발급)
 * - TELEGRAM_CHAT_ID: 알림 받을 채팅/채널 ID
 */

export type NotificationPayload = {
  title: string;
  content: string;
};

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

function getChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID?.trim() || null;
}

/**
 * 텔레그램으로 메시지 전송
 */
export async function sendTelegram(message: string): Promise<boolean> {
  const token = getBotToken();
  const chatId = getChatId();

  if (!token || !chatId) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 설정되지 않았습니다.");
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Telegram] 전송 실패 (${response.status}): ${detail.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Telegram] 전송 에러:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * 구조화된 알림 전송 (제목 + 내용)
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const message = `<b>${escapeHtml(payload.title)}</b>\n\n${escapeHtml(payload.content)}`;
  return sendTelegram(message);
}

/**
 * 모의투자 체결 알림
 */
export async function notifyTrade(input: {
  type: "buy" | "sell";
  symbol: string;
  name: string;
  price: number;
  quantity: number;
  reason: string;
}): Promise<boolean> {
  const emoji = input.type === "buy" ? "🟢" : "🔴";
  const action = input.type === "buy" ? "매수" : "매도";
  const message = [
    `${emoji} <b>모의 ${action} 체결</b>`,
    ``,
    `종목: ${escapeHtml(input.name)} (${escapeHtml(input.symbol)})`,
    `가격: ${input.price.toLocaleString()}원`,
    `수량: ${input.quantity}주`,
    `금액: ${(input.price * input.quantity).toLocaleString()}원`,
    `사유: ${escapeHtml(input.reason)}`,
    `시각: ${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ].join("\n");
  return sendTelegram(message);
}

/**
 * 일간 보고서 알림
 */
export async function notifyDailyReport(input: {
  date: string;
  totalTrades: number;
  wins: number;
  netReturnPct: number;
  topTrade: { symbol: string; name: string; returnPct: number } | null;
  worstTrade: { symbol: string; name: string; returnPct: number } | null;
}): Promise<boolean> {
  const winRate = input.totalTrades > 0 ? (input.wins / input.totalTrades * 100).toFixed(1) : "0";
  const emoji = input.netReturnPct >= 0 ? "📈" : "📉";
  const message = [
    `${emoji} <b>모의투자 일간 보고서</b>`,
    `날짜: ${input.date}`,
    ``,
    `거래: ${input.totalTrades}건 | 승률: ${winRate}%`,
    `순수익: ${input.netReturnPct >= 0 ? "+" : ""}${input.netReturnPct.toFixed(2)}%`,
    input.topTrade ? `최고: ${input.topTrade.name} +${input.topTrade.returnPct.toFixed(2)}%` : "",
    input.worstTrade ? `최악: ${input.worstTrade.name} ${input.worstTrade.returnPct.toFixed(2)}%` : "",
  ].filter(Boolean).join("\n");
  return sendTelegram(message);
}

/**
 * 시장 국면 변화 알림
 */
export async function notifyRegimeChange(input: {
  from: string;
  to: string;
  recommendation: string;
}): Promise<boolean> {
  const message = [
    `⚡ <b>시장 국면 전환</b>`,
    ``,
    `${input.from} → ${input.to}`,
    ``,
    `${input.recommendation}`,
  ].join("\n");
  return sendTelegram(message);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
