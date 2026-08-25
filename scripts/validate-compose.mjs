// docker-compose.yml 오프라인 구조 검증.
// Docker 미설정 환경에서도 수행 가능한 최소 검증(문법·필수요소)이며,
// `docker compose config`의 완전한 대체가 아니다(실행은 Docker 환경에서).
import fs from 'node:fs';
import YAML from 'yaml';

const file = 'docker-compose.yml';
let fail = 0;
const ok = (msg) => console.log(`  OK   ${msg}`);
const bad = (msg) => { fail++; console.log(`  FAIL ${msg}`); };

const doc = YAML.parse(fs.readFileSync(file, 'utf8'));
console.log(`[compose-validate] ${file}`);

const requiredServices = ['web', 'api', 'postgres', 'qdrant', 'valkey'];
const jobServices = ['crawler', 'ingest'];
const all = Object.keys(doc.services ?? {});
for (const s of [...requiredServices, ...jobServices]) {
  if (all.includes(s)) ok(`service present: ${s}`);
  else bad(`missing service: ${s}`);
}

for (const s of requiredServices) {
  const svc = doc.services?.[s];
  if (!svc) continue;
  if (svc.healthcheck?.test) ok(`${s}: healthcheck 있음`);
  else bad(`${s}: healthcheck 없음`);
  const dangerous =
    svc.network_mode === 'host' || svc.privileged === true ||
    Object.values(svc.build ?? {}).some((v) => String(v) === 'privileged');
  if (dangerous) bad(`${s}: host 네트워크/privileged 감지`);
}
ok('host 네트워크·privileged 미사용(장기 실행 서비스)');

const images = Object.values(doc.services).map((s) => s.image).filter(Boolean);
for (const img of images) {
  if (/:(.*)latest/.test(img)) bad(`latest 태그 사용: ${img}`);
}
if (images.length > 0 && !images.some((i) => /latest/.test(i))) ok('고정 이미지 태그(latest 없음)');
else if (images.length === 0) ok('빌드 기반 이미지(latest 태그 없음)');

const apiEnv = JSON.stringify(doc.services?.api?.environment ?? []);
if (apiEnv.includes('SESSION_SECRET:?')) ok('SESSION_SECRET 필수 주입(? 문법) 확인');
else bad('SESSION_SECRET 필수 주입 누락');
if (apiEnv.includes('SEN_CONTRACT_DATA_ROOT=/data')) ok('데이터 경로 환경변수화 확인');
else bad('SEN_CONTRACT_DATA_ROOT 하드코딩 점검 필요');

const volumes = doc.services?.api?.volumes ?? [];
if (volumes.some((v) => String(v).includes('${SEN_CONTRACT_DATA_ROOT'))) ok('데이터 볼륨이 NAS 경로 변수 사용');
else bad('api 데이터 볼륨이 고정 경로임');

const pgPort = String(doc.services?.postgres?.ports?.[0] ?? '');
if (pgPort.includes('15432') || pgPort.includes('POSTGRES_PORT')) ok(`postgres 외부 포트 기본 비표준(15432): ${pgPort}`);
else bad(`postgres 포트 설정 점검: ${pgPort}`);

if (fail === 0) {
  console.log('[compose-validate] PASS — 구조 검증 통과(단, docker compose config 대체 아님)');
} else {
  console.log(`[compose-validate] FAIL — ${fail}건`);
  process.exit(1);
}
