# Requirements Document

## Introduction

키움캐치 HTS 수준의 고도화된 조건식 작성기 기능을 구현한다. 사용자는 5대 분류(추세, 모멘텀, 변동성, 거래량, 캔들패턴) 아래 30개 이상의 세부 지표를 트리 구조로 탐색하며, 각 지표별 파라미터를 설정하고, AND/OR/NOT 논리 그룹으로 조합한 뒤 즉시 백테스트를 실행할 수 있다. 작성한 조건식은 라이브러리에 저장·관리하며, 랜덤 생성(유전자 알고리즘)에서도 확장된 지표 풀을 활용한다. 데이터가 아직 확보되지 않은 카테고리는 UI에서 '준비중' 상태로 비활성화한다.

## Glossary

- **Condition_Builder**: 조건식 작성기 페이지 전체 UI 모듈
- **Category_Tree**: 5대 분류(추세/모멘텀/변동성/거래량/캔들패턴)와 30개 이상 세부 지표를 트리 형태로 표현하는 좌측 네비게이션 컴포넌트
- **Indicator_Node**: Category_Tree 내의 개별 지표 항목 (예: RSI, VWAP, OBV 등)
- **Condition_Rule**: 하나의 지표와 그 파라미터(기간, 임계값, 비교연산자 등)를 결합한 단일 조건 객체
- **Expression_Group**: AND/OR/NOT 논리로 Condition_Rule 또는 중첩 Expression_Group을 묶은 논리 그룹
- **Condition_Expression**: 최상위 Expression_Group으로 구성된 완성된 조건식
- **Parameter_Panel**: 선택된 Indicator_Node에 대한 세부 파라미터를 설정하는 우측 편집 영역
- **Preset_Library**: 사용자가 저장한 Condition_Expression 목록을 관리하는 저장소 (Supabase strategyPresets 테이블 기반)
- **Backtest_Engine**: Condition_Expression을 입력받아 과거 데이터로 시뮬레이션을 수행하는 서버측 백테스트 모듈
- **Random_Generator**: 유전자 알고리즘 기반으로 랜덤 Condition_Expression을 생성하는 모듈
- **Availability_Status**: 각 Indicator_Node의 데이터 확보 상태를 나타내는 플래그 (available 또는 coming_soon)

## Requirements

### Requirement 1: 카테고리 트리 구조 표시

**User Story:** As a 트레이더, I want 5대 분류와 30개 이상 세부 지표를 계층적 트리로 탐색하고 싶다, so that 원하는 기술적 지표를 빠르게 찾아 조건식에 추가할 수 있다.

#### Acceptance Criteria

1. THE Condition_Builder SHALL 5대 최상위 카테고리(추세, 모멘텀, 변동성, 거래량, 캔들패턴)를 트리 루트 노드로 표시한다.
2. WHEN 사용자가 최상위 카테고리를 펼치면, THE Category_Tree SHALL 해당 카테고리 아래의 모든 Indicator_Node를 계층적으로 표시한다.
3. THE Category_Tree SHALL 추세 카테고리 아래에 이동평균배열(ma_position), MACD(macd_rising), MACD레벨(macd_level), MACD히스토그램, VWAP, 이격도, 엔벨로프, ADX, DMI 지표를 포함한다.
4. THE Category_Tree SHALL 모멘텀 카테고리 아래에 RSI, 스토캐스틱(stochastic), Williams %R, CCI, 고수익률(high_return), 종가변동(close_change), 신고가(new_high), 신고가/신저가 지표를 포함한다.
5. THE Category_Tree SHALL 변동성 카테고리 아래에 볼린저밴드(bollinger), ATR%(atr_percent), 갭%(gap_percent), 봉내위치(intrabar_position), 가격레인지(price_range) 지표를 포함한다.
6. THE Category_Tree SHALL 거래량 카테고리 아래에 거래대금(turnover), 거래량비율(volume_ratio), 거래대금횟수(turnover_count), 거래량비율횟수(volume_ratio_count), OBV, 거래대금이평, 볼륨프로파일 지표를 포함한다.
7. THE Category_Tree SHALL 캔들패턴 카테고리 아래에 연속양봉(bullish_candle_count), 연속음봉, 갭상승, 갭하락, N자형패턴 지표를 포함한다.
8. WHEN Indicator_Node의 Availability_Status가 coming_soon이면, THE Category_Tree SHALL 해당 노드를 '준비중' 라벨과 함께 비활성화 상태로 표시한다.
9. WHILE Indicator_Node가 비활성화 상태인 동안, THE Category_Tree SHALL 해당 노드의 클릭 및 드래그 상호작용을 차단한다.

### Requirement 2: 조건 파라미터 설정

**User Story:** As a 트레이더, I want 각 지표별로 기간, 임계값, 비교연산자 등 세부 파라미터를 설정하고 싶다, so that 나만의 정밀한 매매 조건을 정의할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 활성화된 Indicator_Node를 선택하면, THE Parameter_Panel SHALL 해당 지표에 적합한 파라미터 입력 필드를 표시한다.
2. THE Parameter_Panel SHALL 각 파라미터에 대해 유효한 입력 범위를 표시하고 범위 밖 입력을 즉시 검증한다.
3. THE Parameter_Panel SHALL 비교연산자(이상, 이하, 초과, 미만, 상향돌파, 하향돌파, 사이)를 드롭다운으로 선택할 수 있게 제공한다.
4. THE Parameter_Panel SHALL 룩백 기간(일 단위)을 숫자 입력으로 설정할 수 있게 제공한다.
5. WHEN 사용자가 파라미터 값을 변경하면, THE Parameter_Panel SHALL 변경 사항을 현재 편집 중인 Condition_Rule에 실시간 반영한다.
6. THE Parameter_Panel SHALL 각 지표별 기본값을 제공하여 사용자가 즉시 조건을 추가할 수 있게 한다.

### Requirement 3: 논리 그룹 조합

**User Story:** As a 트레이더, I want 여러 조건을 AND/OR/NOT으로 중첩 그룹핑하고 싶다, so that 복잡한 매매 전략을 표현할 수 있다.

#### Acceptance Criteria

1. THE Condition_Builder SHALL 사용자가 새로운 Expression_Group을 생성하고 AND, OR, NOT 중 하나의 논리 연산자를 선택할 수 있게 한다.
2. THE Condition_Builder SHALL Expression_Group 안에 Condition_Rule 또는 다른 Expression_Group을 자식으로 추가할 수 있게 한다.
3. THE Condition_Builder SHALL Expression_Group의 중첩 깊이를 최대 4단계로 제한한다.
4. WHEN 사용자가 NOT 그룹을 선택하면, THE Condition_Builder SHALL 해당 그룹의 자식 평가 결과를 반전하여 표시한다.
5. THE Condition_Builder SHALL 드래그 앤 드롭으로 Condition_Rule과 Expression_Group의 순서 및 소속 그룹을 변경할 수 있게 한다.
6. WHEN Expression_Group에 자식이 없으면, THE Condition_Builder SHALL 해당 그룹을 시각적으로 빈 상태임을 표시하고 조건 추가를 유도한다.

### Requirement 4: 조건식 백테스트 실행

**User Story:** As a 트레이더, I want 작성한 조건식으로 바로 백테스트를 실행하고 싶다, so that 조건식의 과거 성과를 즉시 확인할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 백테스트 실행 버튼을 클릭하면, THE Condition_Builder SHALL 현재 Condition_Expression을 Backtest_Engine에 전달한다.
2. IF Condition_Expression에 활성화된 Condition_Rule이 하나도 없으면, THEN THE Condition_Builder SHALL "최소 1개 이상의 활성 조건이 필요합니다" 오류 메시지를 표시한다.
3. WHILE 백테스트가 실행 중인 동안, THE Condition_Builder SHALL 로딩 상태를 표시하고 중복 실행 요청을 차단한다.
4. WHEN Backtest_Engine이 결과를 반환하면, THE Condition_Builder SHALL 수익률, 승률, MDD, 거래 횟수를 결과 패널에 표시한다.
5. THE Condition_Builder SHALL 백테스트 실행 시 보유기간, 수수료율, 슬리피지 파라미터를 설정할 수 있게 한다.
6. IF Backtest_Engine에서 오류가 발생하면, THEN THE Condition_Builder SHALL 사용자에게 오류 내용을 표시하고 재시도 옵션을 제공한다.

### Requirement 5: 랜덤 조건식 생성 고도화

**User Story:** As a 트레이더, I want 랜덤 생성 시에도 확장된 지표 풀을 활용하고 싶다, so that 유전자 알고리즘이 더 다양한 전략을 탐색할 수 있다.

#### Acceptance Criteria

1. THE Random_Generator SHALL Availability_Status가 available인 모든 Indicator_Node의 타입을 랜덤 생성 풀에 포함한다.
2. THE Random_Generator SHALL 생성 시 각 Condition_Rule의 파라미터를 해당 지표의 유효 범위 내에서 무작위로 결정한다.
3. THE Random_Generator SHALL 기존 18종 지표에 추가로 VWAP, OBV, Williams %R, 엔벨로프, ADX, CCI, DMI, MACD히스토그램, 이격도, 거래대금이평, 신고가/신저가, 연속음봉, 갭상승, 갭하락, N자형패턴 지표를 포함한다.
4. WHEN 랜덤 생성된 Condition_Expression이 Expression_Group을 포함하면, THE Random_Generator SHALL AND, OR 논리 연산자를 무작위로 배정한다.
5. THE Random_Generator SHALL 생성된 각 Condition_Rule에 지표별 기본 가중치를 배정한다.

### Requirement 6: 조건식 저장 및 관리

**User Story:** As a 트레이더, I want 작성한 조건식을 저장하고 라이브러리에서 관리하고 싶다, so that 전략을 재사용하고 비교할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 저장 버튼을 클릭하면, THE Preset_Library SHALL 현재 Condition_Expression을 이름과 설명과 함께 strategyPresets 테이블에 저장한다.
2. THE Preset_Library SHALL 저장된 조건식 목록을 생성일 역순으로 표시한다.
3. WHEN 사용자가 저장된 조건식을 선택하면, THE Preset_Library SHALL 해당 Condition_Expression을 Condition_Builder 편집 영역에 불러온다.
4. THE Preset_Library SHALL 저장된 조건식의 이름 변경, 삭제, 복제 기능을 제공한다.
5. IF 저장 시 동일한 이름의 조건식이 이미 존재하면, THEN THE Preset_Library SHALL 덮어쓰기 확인 대화상자를 표시한다.
6. THE Preset_Library SHALL 각 저장된 조건식에 마지막 백테스트 결과 요약(수익률, 승률)을 함께 표시한다.

### Requirement 7: MainDashboard 탭 연동

**User Story:** As a 트레이더, I want MainDashboard에서 조건식 작성기 페이지로 쉽게 이동하고 싶다, so that 기존 워크플로우에서 자연스럽게 고급 조건식을 작성할 수 있다.

#### Acceptance Criteria

1. THE Condition_Builder SHALL 별도 페이지(/condition-builder)로 라우팅되어 접근 가능하다.
2. THE MainDashboard SHALL 네비게이션 탭에 "조건식 작성기" 항목을 포함한다.
3. WHEN 사용자가 MainDashboard의 "조건식 작성기" 탭을 클릭하면, THE MainDashboard SHALL /condition-builder 페이지로 이동한다.
4. WHEN 사용자가 원클릭 백테스트 결과에서 조건식 편집을 요청하면, THE Condition_Builder SHALL 해당 조건식을 편집 모드로 불러온다.

### Requirement 8: 데이터 미확보 카테고리 처리

**User Story:** As a 시스템 관리자, I want 데이터가 아직 확보되지 않은 지표를 안전하게 비활성화하고 싶다, so that 사용자가 실행 불가능한 조건을 선택하는 것을 방지할 수 있다.

#### Acceptance Criteria

1. THE Condition_Builder SHALL 각 Indicator_Node에 대해 Availability_Status를 설정 파일 또는 서버 응답으로 관리한다.
2. WHEN Indicator_Node의 Availability_Status가 coming_soon이면, THE Parameter_Panel SHALL 해당 지표의 파라미터 설정을 비활성화한다.
3. THE Random_Generator SHALL Availability_Status가 coming_soon인 지표를 랜덤 생성 풀에서 제외한다.
4. WHEN 저장된 조건식에 현재 coming_soon 상태인 지표가 포함되어 있으면, THE Preset_Library SHALL 해당 조건식을 "일부 조건 사용 불가" 경고와 함께 표시한다.
5. THE Condition_Builder SHALL Availability_Status 변경 시 UI를 즉시 반영하기 위해 서버로부터 최신 상태를 조회한다.
