# RULE_REVIEW_QUEUE.md — 규칙 승인 대기열(자동 생성)

- 생성시각: 2026-08-26T01:46:01.697Z
- 활성화 절차: `/admin/rules`에서 [검토 완료(reviewed)] → [승인(active)] 순으로 클릭
- 원칙: 이 문서만 보고 승인하지 말 것 — 반드시 각 항목의 원문 URL에서 값 대조 후 승인

## A. 구조화 초안 — 계약방법 밴드 (3건)

### construction.method.band.10a8cb4bc567f

| 항목 | 값 |
| --- | --- |
| 계약방법(원문 인용) | 입찰 |
| 조건(추정가격) | [0,100000000] (엔진: [lo, hi) 상한 미포함) |
| 원문 문장 | 입찰 / 1억 미만 입찰 |
| 경계 검토 | 초안 자동 생성 — 승인 전 반드시 원문과 대조할 것 |
| 원문 URL | https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do |
| 마지막 확인일 | 2026-08-26 |

### construction.method.band.ac9cf514f78c1

| 항목 | 값 |
| --- | --- |
| 계약방법(원문 인용) | 수의계약 |
| 조건(추정가격) | [0,100000000] (엔진: [lo, hi) 상한 미포함) |
| 원문 문장 | 2인이상 견적제출 수의계약 / 1억원 이하 |
| 경계 검토 | 초안 자동 생성 — 승인 전 반드시 원문과 대조할 것 / 원문 경계가 "이하"(포함)임 — 엔진 between은 상한 미포함(<)이므로 상한값을 1원 보정할지 승인 시 결정 필요 |
| 원문 URL | https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do |
| 마지막 확인일 | 2026-08-26 |

### construction.method.band.bd1e7d8d8af6e

| 항목 | 값 |
| --- | --- |
| 계약방법(원문 인용) | 입찰 |
| 조건(추정가격) | [100000000,0] (엔진: [lo, hi) 상한 미포함) |
| 원문 문장 | 입찰 / 1억원 초과 |
| 경계 검토 | 초안 자동 생성 — 승인 전 반드시 원문과 대조할 것 / 원문 경계가 "초과"(미포함)임 — 엔진 하한은 포함(>=)이므로 하한값 처리 방식 승인 시 확인 필요 |
| 원문 URL | https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do |
| 마지막 확인일 | 2026-08-26 |

## B. 기타 draft 규칙 (0건)
_없음_

## C. 문장 후보(candidate) 요약 — 상위 30건 / 전체 60건
- [amount] "기재금액이 5천만원 초과 1억원 이하인 경우: 7만원" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "입찰 | 4억원 초과 | 2억원 초과 | 1억 6천만원 초과" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "현장설명: 300억원 이상 의무, 300억원 미만 선택" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "기본(추정가격 2억원 이하) 87.745%(적격심사) 예외 개별 법령 확인 | 최저가 | 낙찰하한율 없음 (종합평가 점수)" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "기재금액이 10억 초과인 경우: 35만원" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "2인 이상 견적서 제출 수의계약 | 4억원 이하 | 2억원 이하 | 1억 6천만원 이하" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "2인 이상 견적서 제출 수의계약: 89.745% 입찰: 기본 89.745%(추정가격 등에 따라 다름)(적격심사 실시) ※ 추정가격 300억원 이상 공사: 종합평가" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "현장설명: 300억원 이상 의무, 300억원 미만 선택" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "추정가격 | 2천만원 초과 ~ 1억원 이하 | 1억 미만 입찰 | 1억~2.3억 미만 입찰" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "추정가격 | 2천만원 초과 ~ 1억원 이하 | 1억 미만 입찰 | 1억~2.3억 미만 입찰" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "추정가격 | 1억원 초과 | 1억원 이하 | 2천만원이하" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "추정가격 | 1억원 초과 | 1억원 이하 | 2천만원이하" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "기본(추정가격 2억원 이하) 87.745%(적격심사) 예외 개별 법령 확인 | 최저가 | 낙찰하한율 없음 (종합평가 점수)" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "구분 공고 시기 2인 이상 견적서 제출 수의계약 3일 이상(공휴일과 토요일 제외) 입찰 현장설명 ○ 현장설명일의 전날부터 기산하여 7일 전에 공고 현장설명 X 입" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "구분 2인이상 수의계약 입찰 추정가격 2천만원 초과 ~ 1억원 이하 1억 미만 입찰 1억~2.3억 미만 입찰 참가자격 소기업, 소상공인 소기업, 소상공인 중소기업" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "기재금액이 1억원 초과 10억원 이하인 경우: 15만원" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "입찰 | 4억원 초과 | 2억원 초과 | 1억 6천만원 초과" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "사업자등록증 사본, 법인등기사항전부증명서(G2B 등록정보로 대체 가능) 건설업등록증 사본(G2B 등록정보로 대체 가능), 건설업등록수첩 사본 계약보증금(현금, 증" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "현장설명 X | 입찰서 제출 마감일의 전날부터 기산하여 7일전에 공고(추정가격 10억원 미만)" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "현장설명 X | 입찰서 제출 마감일의 전날부터 기산하여 7일전에 공고(추정가격 10억원 미만)" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "도급 또는 위임에 관한 증서 중 법률에 따라 작성하는 문서로서 대통령령으로 정하는 것 | 기재금액이 1천만원 초과 3천만원 이하인 경우: 2만원" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "제한입찰: 각 항목별 제한요건은 추정가격 등에 따라 다르며, 각 항목을 중복적으로 제한할 수 없는 것이 기본 원칙 ※ 예외: ⑧중소기업자는 다른 항목과 중복가능 " — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "2인 이상 견적서 제출 수의계약 | 4억원 이하 | 2억원 이하 | 1억 6천만원 이하" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "기재금액이 3천만원 초과 5천만원 이하인 경우: 4만원" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "중소기업제품 구매촉진 및 판로 지원에 관한 법률 및 같은 법 시행령에 의하면 추정가격 2억 원 미만인 물품 또는 용역을 조달하려는 경우에는 중소기업자 간 제한경쟁" — https://contract.sen.go.kr/fus/MI000000000000000388/board/BO00000122/CD030/list0010v.do
- [amount] "「신용카드 및 현금영수증 카드 사용•관리 요령(서울특별시교육청, 2015.1)」에 따르면, 인터넷을 통한 물품구매 시 「전자상거래 등에서의 소비자보호에 관한 법」" — https://contract.sen.go.kr/fus/MI000000000000000387/board/BO00000122/CD020/list0010v.do
- [amount] "산재보험료: 모든 건설공사 및 전기·통신·소방공사에 적용 고용보험료: 모든 건설공사 및 전기·통신·소방공사에 적용(다만, 총 공사금액 2천만원 미만의 건설공사를 " — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "구분 종합공사 전문공사 전기 등 그 밖의 공사 1인 견적서 제출 가능 수의계약 2천만원 이하 여성기업·장애인기업·사회적경제기업: 5천만원 이하 1인수의 가능 2인" — https://contract.sen.go.kr/fus/MI000000000000000332/html/cont0010v.do
- [amount] "입찰 입찰(일반,제한) 2단계입찰 협상에의한계약 기본(추정가격 2억원 이하) 87.745%(적격심사) 예외 개별 법령 확인 최저가 낙찰하한율 없음 (종합평가 점수" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
- [amount] "수의계약 추정가격 2천만원 초과: 88% 추정가격 2천만원 이하: 90% | 입찰(일반,제한) | 2단계입찰 | 협상에의한계약 | 기본(추정가격 2억원 이하) 8" — https://contract.sen.go.kr/fus/MI000000000000000331/html/cont0010v.do
