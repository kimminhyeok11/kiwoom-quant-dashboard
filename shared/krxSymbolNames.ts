/**
 * 로컬 실제 데이터 유니버스에서 사용한 KRX 종목코드의 표시명입니다.
 * 가격·거래량·성과 수치는 포함하지 않으며, 수집 원본에 누락된 이름을 사람이 읽을 수 있게 보정하는 메타데이터입니다.
 */
export const KRX_SYMBOL_NAMES: Record<string, string> = {
  "000660": "SK하이닉스",
  "002990": "금호타이어",
  "005380": "현대차",
  "005930": "삼성전자",
  "005935": "삼성전자우",
  "009150": "삼성전기",
  "036930": "주성엔지니어링",
  "066570": "LG전자",
  "067310": "하나마이크론",
  "069500": "KODEX 200",
  "102110": "티케이케미칼",
  "114800": "KODEX 인버스",
  "122630": "KODEX 레버리지",
  "229200": "KODEX 코스닥150",
  "233740": "KODEX 코스닥150 레버리지",
  "252670": "KODEX 200선물인버스2X",
  "402340": "SK스퀘어",
  "403870": "HPSP",
  "459580": "KODEX CD금리액티브(합성)",
};

export function getKrxSymbolName(symbol: string, storedName?: string | null) {
  const normalizedStoredName = storedName?.trim();
  if (normalizedStoredName && normalizedStoredName !== symbol) return normalizedStoredName;
  return KRX_SYMBOL_NAMES[symbol] ?? symbol;
}
