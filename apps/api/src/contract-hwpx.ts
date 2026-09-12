import fs from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { CONTRACT_FIELD_DEFS, CONTRACT_REVIEW_KEYS, validateContractFields, type ContractFields, type ContractFieldKey } from '@sen/shared';

// Licensed package baseline; provenance and modifications are recorded with the asset.
const baseline = unzipSync(fs.readFileSync(new URL('../assets/hwpx/Skeleton.hwpx', import.meta.url)));
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Recreates the source form's sections as editable HWPX tables, not a screenshot. */
export function generateContractHwpx(input: ContractFields): Buffer {
  const parsed = validateContractFields(input);
  if (!parsed.ok) throw new Error('계약서 입력값이 올바르지 않습니다.');
  const f = parsed.fields;
  let id = 1000;
  const p = (text: string) => `<hp:p id="${id++}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;
  const v = (key: ContractFieldKey) => f[key] || (CONTRACT_REVIEW_KEYS.includes(key) ? '[검토 필요]' : '[미입력]');
  const table = (rows: string[][], widths: number[]) => {
    const rowHeights = rows.map((row) => Math.max(...row.map((text, c) => Math.ceil([...text].length / Math.max(1, Math.floor((widths[c] - 1020) / 1000))) * 1600 + 400), 2200));
    const height = rowHeights.reduce((a, b) => a + b, 0);
    const tr = rows.map((row, r) => `<hp:tr>${row.map((text, c) => `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="3"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${text.split('\n').map(p).join('')}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${widths[c]}" height="${rowHeights[r]}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`).join('')}</hp:tr>`).join('');
    return `<hp:p id="${id++}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${id++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="42520" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${tr}</hp:tbl><hp:t/></hp:run></hp:p>`;
  };
  const body = [
    p('공 사 도 급 표 준 계 약 서'),
    p('초안 · 담당자 검토 필요 (자동 법적 판단·승인 문서가 아닙니다)'),
    p(`계약번호: ${v('contractNumber')}    공고번호: ${v('noticeNumber')}`),
    table([
      ['발주처', v('agencyName')],
      ['계약상대자', `상호: ${v('companyName')}\n사업자등록번호: ${v('companyRegistration')}\n주소: ${v('companyAddress')}\n전화번호: ${v('companyPhone')}\n대표자: ${v('companyRepresentative')}`],
      ['연대보증인', `상호: ${v('guarantorName')}\n사업자등록번호: ${v('guarantorRegistration')}\n주소: ${v('guarantorAddress')}\n전화번호: ${v('guarantorPhone')}\n대표자: ${v('guarantorRepresentative')}`],
      ['공사명', v('workName')], ['계약금액(원)', v('contractAmount')], ['총공사부기금액(원)', v('totalAmount')],
      ['계약보증금', v('contractBond')], ['현장', v('site')], ['지체상금률', v('delayRate')],
      ['물가변동 계약금액 조정방법', v('priceAdjustment')], ['착공연월일', v('startDate')], ['준공연월일', v('endDate')]
    ], [10000, 32520]),
    p('기타사항'), ...v('notes').split('\n').map(p),
    p('하자담보책임 (복합공종은 공종별로 구분 기재)'),
    table([
      ['공종', '공종별 계약금액(원)', '보증금율 및 금액(원)', '하자담보책임기간'],
      [v('warrantyWorkType'), v('warrantyAmount'), `${v('warrantyRate')}\n${v('warrantyBond')}`, v('warrantyPeriod')]
    ], [9000, 10000, 13000, 10520]),
    // Source sheet C27. No new legal conditions or rates are introduced here.
    p('계약담당자와 계약상대자는 상호 대등한 입장에서 붙임의 계약문서에 의하여 위 공사에 대한 도급계약을 체결하고 신의에 따라 성실히 계약상의 의무를 이행할 것을 확약하며, 연대보증인은 계약자와 연대하여 계약상의 의무를 이행할 것을 확약한다. 이 계약의 증거로서 계약서를 작성하여 당사자가 기명날인한 후 각각 1통씩 보관한다.'),
    p('붙임서류 (목록만 기재하며 실제 파일은 별도 첨부)'), ...v('attachments').split('\n').map(p),
    p(`계약일: ${v('contractDate')}`),
    table([
      ['계약자', '계약상대자'],
      [`기관명: ${v('agencyName')}\n주소: ${v('agencyAddress')}\n${v('agencyOfficerTitle')}: ${v('agencyOfficerName')} (인)`, `상호: ${v('companyName')}\n주소: ${v('companyAddress')}\n대표: ${v('companyRepresentative')} (인)`]
    ], [21260, 21260])
  ].join('');
  const baseSection = strFromU8(baseline['Contents/section0.xml']);
  const root = baseSection.slice(0, baseSection.indexOf('<hp:p '));
  const properties = baseSection.match(/<hp:secPr\b[\s\S]*?<\/hp:secPr>/)?.[0];
  const columns = baseSection.match(/<hp:ctrl>[\s\S]*?<\/hp:ctrl>/)?.[0];
  if (!properties || !columns) throw new Error('HWPX 기본 서식 오류');
  const first = `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${properties}${columns}<hp:t/></hp:run></hp:p>`;
  const header = strFromU8(baseline['Contents/header.xml']);
  const border = header.match(/<hh:borderFill id="1"[\s\S]*?<\/hh:borderFill>/)?.[0];
  if (!border) throw new Error('HWPX 테두리 서식 오류');
  const tableBorder = border.replace('id="1"', 'id="3"').replace(/(<hh:(?:left|right|top|bottom)Border) type="NONE"/g, '$1 type="SOLID"');
  const packageXml = strFromU8(baseline['Contents/content.hpf']).replace(/<opf:metadata>[\s\S]*?<\/opf:metadata>/,
    '<opf:metadata><opf:title>공사표준계약서 초안</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">공사계약 통합지원 시스템</opf:meta></opf:metadata>');
  // Only allowlisted non-executable baseline parts survive; generated body and preview carry no stale data.
  const parts: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { mimetype: [strToU8('application/hwp+zip'), { level: 0 }] };
  for (const key of ['version.xml', 'settings.xml', 'META-INF/container.xml', 'META-INF/container.rdf', 'META-INF/manifest.xml']) parts[key] = baseline[key];
  parts['Contents/header.xml'] = strToU8(header.replace('<hh:borderFills itemCnt="2">', '<hh:borderFills itemCnt="3">').replace('</hh:borderFills>', `${tableBorder}</hh:borderFills>`));
  parts['Contents/section0.xml'] = strToU8(`${root}${first}${body}</hs:sec>`);
  parts['Contents/content.hpf'] = strToU8(packageXml);
  parts['Preview/PrvText.txt'] = strToU8(`공사표준계약서 초안\n${CONTRACT_FIELD_DEFS.map(([key, label]) => `${label}: ${v(key)}`).join('\n')}`);
  // Preserve required third-party notices with the generated package as well as the source asset.
  parts['LICENSE.python-hwpx'] = fs.readFileSync(new URL('../assets/hwpx/LICENSE.python-hwpx', import.meta.url));
  parts['NOTICE.python-hwpx'] = fs.readFileSync(new URL('../assets/hwpx/NOTICE.python-hwpx', import.meta.url));
  return Buffer.from(zipSync(parts, { level: 6 }));
}
