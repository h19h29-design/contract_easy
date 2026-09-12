import { isIsoDate } from './date.js';

/** Source: 2026.5 배포 원클릭 XLSM / 3.공사표준계약서. No legal defaults. */
export const CONTRACT_TEMPLATE_VERSION = 'sen-construction-2026-04-v1';
export const CONTRACT_FIELD_DEFS = [
  ['contractNumber', '계약번호', '계약정보', 'text', false],
  ['noticeNumber', '공고번호', '계약정보', 'text', false],
  ['workName', '공사명', '계약정보', 'text', true],
  ['site', '현장', '계약정보', 'text', true],
  ['contractAmount', '계약금액(원)', '계약정보', 'amount', true],
  ['totalAmount', '총공사부기금액(원)', '계약정보', 'amount', false],
  ['contractDate', '계약일', '계약정보', 'date', true],
  ['startDate', '착공일', '계약정보', 'date', true],
  ['endDate', '준공일', '계약정보', 'date', true],
  ['agencyName', '발주기관명', '발주기관', 'text', true],
  ['agencyAddress', '발주기관 주소', '발주기관', 'text', true],
  ['agencyOfficerTitle', '계약담당자 직위', '발주기관', 'text', true],
  ['agencyOfficerName', '계약담당자 성명', '발주기관', 'text', true],
  ['companyName', '업체명', '계약상대자', 'text', true],
  ['companyRegistration', '사업자등록번호', '계약상대자', 'text', true],
  ['companyAddress', '업체 주소', '계약상대자', 'text', true],
  ['companyPhone', '업체 전화번호', '계약상대자', 'text', false],
  ['companyRepresentative', '업체 대표자', '계약상대자', 'text', true],
  ['guarantorName', '연대보증인 상호', '연대보증인(해당 시)', 'text', false],
  ['guarantorRegistration', '연대보증인 사업자등록번호', '연대보증인(해당 시)', 'text', false],
  ['guarantorAddress', '연대보증인 주소', '연대보증인(해당 시)', 'text', false],
  ['guarantorPhone', '연대보증인 전화번호', '연대보증인(해당 시)', 'text', false],
  ['guarantorRepresentative', '연대보증인 대표자', '연대보증인(해당 시)', 'text', false],
  ['contractBond', '계약보증금·납부방법', '담당자 확인 항목', 'text', false],
  ['delayRate', '지체상금률', '담당자 확인 항목', 'text', false],
  ['priceAdjustment', '물가변동 계약금액 조정방법', '담당자 확인 항목', 'text', false],
  ['warrantyWorkType', '하자담보 공종', '하자담보책임', 'text', false],
  ['warrantyAmount', '공종별 계약금액(원)', '하자담보책임', 'amount', false],
  ['warrantyRate', '하자보수보증금율', '하자담보책임', 'text', false],
  ['warrantyBond', '하자보수보증금액(원)', '하자담보책임', 'amount', false],
  ['warrantyPeriod', '하자담보책임기간', '하자담보책임', 'text', false],
  ['notes', '기타사항', '기타', 'multiline', false],
  ['attachments', '붙임서류 목록', '기타', 'multiline', false]
] as const;

export type ContractFieldKey = typeof CONTRACT_FIELD_DEFS[number][0];
export type ContractFields = Record<ContractFieldKey, string>;
export interface ContractDraft {
  projectId: string;
  revision: number;
  templateVersion: string;
  fields: ContractFields;
  savedBy: string;
  savedAt: string;
}
export type ContractSaveResult = { ok: true; draft: ContractDraft } | { ok: false; code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' };

export function emptyContractFields(): ContractFields {
  return Object.fromEntries(CONTRACT_FIELD_DEFS.map(([key]) => [key, ''])) as ContractFields;
}

export function validateContractFields(value: unknown): { ok: true; fields: ContractFields } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('입력값은 객체여야 합니다.');
  const input = value as Record<string, unknown>;
  const fields = emptyContractFields();
  if (Object.keys(input).some((key) => !Object.hasOwn(fields, key))) return fail('허용되지 않은 입력 항목입니다.');
  for (const [key, label, , type] of CONTRACT_FIELD_DEFS) {
    const raw = Object.hasOwn(input, key) ? input[key] : '';
    if (typeof raw !== 'string') return fail(`${label}: 문자열로 입력하세요.`);
    const max = type === 'multiline' ? 3000 : 300;
    // Reject invalid XML characters, including unpaired surrogates (but allow Unicode pairs).
    // eslint-disable-next-line no-control-regex -- XML explicitly permits tab, LF and CR.
    if (raw.length > max || /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(raw)) return fail(`${label}: 길이 또는 문자가 올바르지 않습니다.`);
    const text = raw.replace(/\r\n?/g, '\n').trim();
    if (type !== 'multiline' && /[\n\t]/.test(text)) return fail(`${label}: 한 줄로 입력하세요.`);
    if (text && type === 'amount' && !/^(0|[1-9]\d{0,29})$/.test(text)) return fail(`${label}: 쉼표 없는 0 이상의 정수를 입력하세요.`);
    if (text && type === 'date' && !isIsoDate(text)) return fail(`${label}: 실제 날짜를 입력하세요.`);
    fields[key] = text;
  }
  if (fields.startDate && fields.endDate && fields.startDate > fields.endDate) return fail('준공일은 착공일보다 빠를 수 없습니다.');
  return { ok: true, fields };
}

export function contractMissingFields(fields: ContractFields): string[] {
  return CONTRACT_FIELD_DEFS.filter(([key, , , , required]) => required && !fields[key]).map(([, label]) => label);
}

export const CONTRACT_REVIEW_KEYS: ContractFieldKey[] = ['contractBond', 'delayRate', 'priceAdjustment', 'warrantyWorkType', 'warrantyAmount', 'warrantyRate', 'warrantyBond', 'warrantyPeriod', 'attachments'];
