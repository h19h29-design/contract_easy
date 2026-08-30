import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

loadDotenv({ path: path.join(REPO_ROOT, '.env') });

export interface AppConfig {
  dataRoot: string;
  databaseUrl: string | null;
  qdrantUrl: string;
  valkeyUrl: string;
  sessionSecret: string;
  webOrigin: string;
  crawler: {
    userAgent: string;
    contact: string;
    concurrency: number;
    delayMs: number;
    allowAttachments: boolean;
    engine: 'http' | 'playwright';
  };
  llmProvider: 'none' | 'openai' | 'openrouter' | 'ollama';
  llmApiKey: string;
  llmModel: string;
  embeddingProvider: 'none' | 'openai' | 'openrouter' | 'ollama' | 'hash';
  embeddingApiKey: string;
}

function envStr(name: string, def = ''): string {
  return process.env[name] ?? def;
}

export function getConfig(): AppConfig {
  return {
    dataRoot: path.resolve(REPO_ROOT, envStr('SEN_CONTRACT_DATA_ROOT', './data')),
    databaseUrl: envStr('DATABASE_URL') || null,
    qdrantUrl: envStr('QDRANT_URL', 'http://localhost:16333'),
    valkeyUrl: envStr('VALKEY_URL', 'redis://localhost:16379'),
    sessionSecret: envStr('SESSION_SECRET'),
    webOrigin: envStr('WEB_ORIGIN', process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'),
    crawler: {
      userAgent: envStr('CRAWLER_USER_AGENT', 'sen-contract-guide-crawler/0.1 (+contact: unset)'),
      contact: envStr('CRAWLER_CONTACT', 'unset'),
      concurrency: Math.max(1, Number(envStr('CRAWL_CONCURRENCY', '1'))),
      delayMs: Math.max(1200, Number(envStr('CRAWL_DELAY_MS', '1200'))),
      allowAttachments: envStr('CRAWL_ALLOW_ATTACHMENTS', 'false') === 'true',
      engine: envStr('CRAWLER_ENGINE', 'http') === 'playwright' ? 'playwright' : 'http'
    },
    llmProvider: (envStr('LLM_PROVIDER', 'none') as AppConfig['llmProvider']),
    llmApiKey: envStr('LLM_API_KEY'),
    llmModel: envStr('LLM_MODEL'),
    embeddingProvider: (envStr('EMBEDDING_PROVIDER', 'none') as AppConfig['embeddingProvider']),
    embeddingApiKey: envStr('EMBEDDING_API_KEY')
  };
}

export interface CrawlSeeds {
  project: string;
  base_url: string;
  crawl_policy: Record<string, unknown>;
  seeds: Array<{ name: string; url: string; kind: string }>;
  follow_rules: {
    allow_domains: string[];
    allow_path_prefixes: string[];
    deny_query_keys: string[];
    download_extensions: string[];
  };
}

export function loadSeeds(): CrawlSeeds {
  const p = path.join(REPO_ROOT, '02_CRAWL_SEEDS.yaml');
  const raw = fs.readFileSync(p, 'utf8');
  return YAML.parse(raw) as CrawlSeeds;
}

/** data 하위 표준 경로 */
export function dataPaths(cfg = getConfig()) {
  const root = cfg.dataRoot;
  return {
    rawHtml: path.join(root, 'raw', 'html'),
    rawAttachments: path.join(root, 'raw', 'attachments'),
    screenshots: path.join(root, 'raw', 'screenshots'),
    normalizedMarkdown: path.join(root, 'normalized', 'markdown'),
    normalizedTables: path.join(root, 'normalized', 'tables'),
    normalizedForms: path.join(root, 'normalized', 'forms'),
    rulesCandidates: path.join(root, 'normalized', 'rules-candidates'),
    manifests: path.join(root, 'manifests'),
    versions: path.join(root, 'versions'),
    quarantine: path.join(root, 'quarantine'),
    appStore: path.join(root, 'app-store')
  };
}

export function ensureDirs(): ReturnType<typeof dataPaths> {
  const p = dataPaths();
  for (const dir of Object.values(p)) fs.mkdirSync(dir, { recursive: true });
  return p;
}
