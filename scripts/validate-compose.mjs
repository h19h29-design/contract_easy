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
if (apiEnv.includes('WEB_ORIGIN:?')) ok('WEB_ORIGIN 필수 주입(? 문법) 확인');
else bad('WEB_ORIGIN 필수 주입 누락');
if (apiEnv.includes('ADMIN_INITIAL_PASSWORD=')) ok('초기 관리자 비밀번호 환경 전달 확인');
else bad('초기 관리자 비밀번호 환경 전달 누락');
if (apiEnv.includes('DATABASE_URL:?')) ok('운영 PostgreSQL 연결 필수 주입(? 문법) 확인');
else bad('운영 PostgreSQL 연결 필수 주입 누락');
if (apiEnv.includes('API_HOST=0.0.0.0')) ok('API 컨테이너 외부 수신 확인');
else bad('API_HOST=0.0.0.0 누락');
if (apiEnv.includes('SEN_CONTRACT_DATA_ROOT=/data')) ok('데이터 경로 환경변수화 확인');
else bad('SEN_CONTRACT_DATA_ROOT 하드코딩 점검 필요');

const webBuildArgs = JSON.stringify(doc.services?.web?.build?.args ?? {});
if (webBuildArgs.includes('NEXT_PUBLIC_API_URL:?')) ok('브라우저용 API URL 빌드 인자 필수 확인');
else bad('web 빌드에 NEXT_PUBLIC_API_URL 필수 인자 누락');

const volumes = doc.services?.api?.volumes ?? [];
if (volumes.some((v) => String(v).includes('${SEN_CONTRACT_DATA_ROOT:?'))) ok('데이터 볼륨이 필수 NAS 경로 변수 사용');
else bad('api 데이터 볼륨이 필수 NAS 경로를 강제하지 않음');

for (const serviceName of ['postgres', 'qdrant', 'valkey']) {
  const published = doc.services?.[serviceName]?.ports ?? [];
  if (published.length === 0) ok(`${serviceName}: 호스트 포트 미노출`);
  else bad(`${serviceName}: 내부 서비스 호스트 포트 노출 감지`);
}

for (const serviceName of ['web', 'api']) {
  const published = String(doc.services?.[serviceName]?.ports?.[0] ?? '');
  if (published.startsWith('${PUBLIC_BIND_ADDRESS:-127.0.0.1}:')) {
    ok(`${serviceName}: 기본 loopback 바인딩`);
  } else {
    bad(`${serviceName}: 기본 loopback 바인딩 누락`);
  }
}

const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (rootPackage.scripts?.['db:migrate']) ok('문서화된 db:migrate 명령 존재');
else bad('package.json에 db:migrate 명령 누락');

if (fail === 0) {
  console.log('[compose-validate] PASS — 구조 검증 통과(단, docker compose config 대체 아님)');
} else {
  console.log(`[compose-validate] FAIL — ${fail}건`);
  process.exit(1);
}
