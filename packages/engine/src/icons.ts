import { notifyAssetReady, setAssetReadyCallback } from './ready';

export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface IconDef {
  /** Stable identifier in `provider:slug` format. */
  id: string;
  name: string;
  provider: CloudProvider;
  category: string;
  keywords: string[];
  /** Inner SVG markup in a 48×48 view box (tile + glyph). */
  body: string;
}

export interface ProviderMeta {
  id: CloudProvider;
  name: string;
  accent: string;
}

export const CLOUD_PROVIDERS: ProviderMeta[] = [
  { id: 'aws', name: 'AWS', accent: '#ED7100' },
  { id: 'azure', name: 'Azure', accent: '#0089D6' },
  { id: 'gcp', name: 'Google Cloud', accent: '#4285F4' },
];

// Provider category colors

const CAT_COLOR: Record<CloudProvider, Record<string, string>> = {
  aws: {
    Compute: '#ED7100',
    Containers: '#E7761F',
    Storage: '#7AA116',
    Database: '#4D72F3',
    Networking: '#8C4FFF',
    Integration: '#E7157B',
    Analytics: '#8250DF',
    Security: '#DD3444',
    Management: '#3F8624',
  },
  azure: {
    Compute: '#0078D4',
    Containers: '#2E6BB8',
    Storage: '#227AB5',
    Database: '#3B5ED6',
    Networking: '#0098E6',
    Integration: '#7A54C9',
    Analytics: '#00A4A6',
    Security: '#E23E57',
    Management: '#5C2D91',
  },
  gcp: {
    Compute: '#4285F4',
    Containers: '#1A73E8',
    Storage: '#F9AB00',
    Database: '#4285F4',
    Networking: '#34A853',
    Integration: '#EA4335',
    Analytics: '#12A4AF',
    Security: '#EA4335',
    Management: '#34A853',
  },
};

function tileColor(provider: CloudProvider, category: string): string {
  return CAT_COLOR[provider][category] ?? '#5b6472';
}

// Glyphs centered in a 48×48 tile

const S =
  'fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="#fff"';

const GLYPH: Record<string, string> = {
  server: `<rect x="15" y="15" width="18" height="6.4" rx="2" ${S}/><rect x="15" y="26.6" width="18" height="6.4" rx="2" ${S}/><circle cx="19" cy="18.2" r="1.1" ${F}/><circle cx="19" cy="29.8" r="1.1" ${F}/>`,
  vm: `<rect x="14" y="15" width="20" height="15" rx="2.5" ${S}/><path d="M20 33h8M24 30v3" ${S}/><path d="M21 19l4 3-4 3" ${S}/>`,
  func: `<path d="M17 33l8-19 6 19M20.5 25.5L16 15" ${S}/>`,
  container: `<path d="M24 13.5l9 5v11l-9 5-9-5v-11z" ${S}/><path d="M15 18.5l9 5 9-5M24 23.5V34" ${S}/>`,
  registry: `<rect x="15" y="20" width="7" height="7" rx="1.4" ${S}/><rect x="26" y="20" width="7" height="7" rx="1.4" ${S}/><path d="M24 15v3M18.5 20v-2h11v2" ${S}/>`,
  bucket: `<ellipse cx="24" cy="17" rx="9" ry="2.8" ${S}/><path d="M15 17l1.8 15h14.4L33 17" ${S}/>`,
  disk: `<path d="M15 17v14a9 3 0 0 0 18 0V17" ${S}/><ellipse cx="24" cy="17" rx="9" ry="3" ${S}/>`,
  database: `<ellipse cx="24" cy="16" rx="9" ry="3" ${S}/><path d="M15 16v16a9 3 0 0 0 18 0V16M15 24a9 3 0 0 0 18 0" ${S}/>`,
  table: `<rect x="15" y="15" width="18" height="18" rx="2" ${S}/><path d="M15 21h18M15 27h18M24 15v18" ${S}/>`,
  cache: `<path d="M25.5 13.5L16 26h7l-1.5 8.5L31 22h-7z" fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`,
  network: `<circle cx="24" cy="24" r="9.2" ${S}/><path d="M14.8 24h18.4M24 14.8v18.4M17 18.5c4 2.6 10 2.6 14 0M17 29.5c4-2.6 10-2.6 14 0" ${S}/>`,
  loadbalancer: `<circle cx="24" cy="15.5" r="2.5" ${F}/><circle cx="15.5" cy="32.5" r="2.5" ${F}/><circle cx="24" cy="32.5" r="2.5" ${F}/><circle cx="32.5" cy="32.5" r="2.5" ${F}/><path d="M24 18v3c0 3-8.5 3-8.5 6.5v2M24 21v9M24 21c0 3 8.5 3 8.5 6.5v2" ${S}/>`,
  gateway: `<path d="M14 33V19l10-5 10 5v14" ${S}/><path d="M20 33v-9h8v9" ${S}/>`,
  cdn: `<circle cx="24" cy="24" r="9" ${S}/><path d="M15 24h18M24 15v18" ${S}/><path d="M30 16l3-1-1 3M18 32l-3 1 1-3" ${S}/>`,
  queue: `<rect x="14.5" y="17" width="19" height="4.4" rx="1.6" ${S}/><rect x="14.5" y="23.6" width="19" height="4.4" rx="1.6" ${S}/><rect x="14.5" y="30.2" width="12" height="4.4" rx="1.6" ${S}/>`,
  pubsub: `<circle cx="19" cy="24" r="3" ${F}/><path d="M25 18a9 9 0 0 1 0 12M28.5 15a13.5 13.5 0 0 1 0 18" ${S}/>`,
  event: `<path d="M24 13.5l2.6 6.9 7 .3-5.5 4.4 2 6.9-6.1-4-6.1 4 2-6.9-5.5-4.4 7-.3z" ${S}/>`,
  pipeline: `<circle cx="16.5" cy="18" r="2.6" ${S}/><circle cx="31.5" cy="18" r="2.6" ${S}/><circle cx="24" cy="31" r="2.6" ${S}/><path d="M19 19.5l3.5 9M29 19.5l-3.5 9M19 18h10" ${S}/>`,
  shield: `<path d="M24 13.5l8.5 3.2v6.8c0 6.3-4.2 9.6-8.5 11.5-4.3-1.9-8.5-5.2-8.5-11.5v-6.8z" ${S}/><path d="M20 24l3 3 5.5-6" ${S}/>`,
  key: `<circle cx="19" cy="20" r="4.6" ${S}/><path d="M22.3 23.3L33 34M29.5 30.5l2.5-2.5M26.5 27.5l2.2 2.2" ${S}/>`,
  identity: `<circle cx="24" cy="20" r="4.3" ${S}/><path d="M16 33c0-5 4-7.5 8-7.5s8 2.5 8 7.5" ${S}/>`,
  monitor: `<rect x="14" y="16" width="20" height="16" rx="2.5" ${S}/><path d="M17 25h3l2-4 3 8 2-4h3" ${S}/>`,
  analytics: `<rect x="15.5" y="24" width="4.2" height="9" rx="1.2" ${F}/><rect x="21.9" y="17" width="4.2" height="16" rx="1.2" ${F}/><rect x="28.3" y="21" width="4.2" height="12" rx="1.2" ${F}/>`,
  warehouse: `<path d="M14 20l10-6 10 6v13H14z" ${S}/><path d="M19 33V24h10v9" ${S}/><path d="M19 27h10" ${S}/>`,
  browser: `<rect x="14" y="16" width="20" height="16" rx="2.5" ${S}/><path d="M14 21.5h20" ${S}/><circle cx="17.6" cy="18.8" r="1" ${F}/><circle cx="20.6" cy="18.8" r="1" ${F}/>`,
  apigw: `<path d="M23 14c-3.2 0-2.8 4-2.8 6s.2 4-2.7 4c2.9 0 2.7 2 2.7 4s-.4 6 2.8 6M25 14c3.2 0 2.8 4 2.8 6s-.2 4 2.7 4c-2.9 0-2.7 2-2.7 4s.4 6-2.8 6" ${S}/>`,
};

function tile(color: string, glyph: string): string {
  return `<rect x="4" y="4" width="40" height="40" rx="9" fill="${color}"/>${glyph}`;
}

// Icon catalog

type Row = [
  slug: string,
  name: string,
  category: string,
  glyph: keyof typeof GLYPH | string,
  kw?: string,
];

function pack(provider: CloudProvider, rows: Row[]): IconDef[] {
  return rows.map(([slug, name, category, glyph, kw]) => ({
    id: `${provider}:${slug}`,
    name,
    provider,
    category,
    keywords: (kw ?? '').split(/\s+/).filter(Boolean),
    body: tile(tileColor(provider, category), GLYPH[glyph] ?? GLYPH.server!),
  }));
}

const AWS: Row[] = [
  ['ec2', 'EC2', 'Compute', 'server', 'instance virtual machine compute host'],
  ['lambda', 'Lambda', 'Compute', 'func', 'function serverless faas'],
  ['fargate', 'Fargate', 'Containers', 'container', 'serverless container'],
  ['ecs', 'ECS', 'Containers', 'container', 'elastic container service docker'],
  ['eks', 'EKS', 'Containers', 'container', 'kubernetes k8s'],
  ['ecr', 'ECR', 'Containers', 'registry', 'container registry image'],
  ['s3', 'S3', 'Storage', 'bucket', 'object storage bucket blob'],
  ['ebs', 'EBS', 'Storage', 'disk', 'block storage volume disk'],
  ['efs', 'EFS', 'Storage', 'disk', 'file system nfs'],
  ['rds', 'RDS', 'Database', 'database', 'relational sql postgres mysql'],
  ['aurora', 'Aurora', 'Database', 'database', 'relational sql'],
  ['dynamodb', 'DynamoDB', 'Database', 'table', 'nosql key value'],
  ['elasticache', 'ElastiCache', 'Database', 'cache', 'redis memcached cache'],
  ['redshift', 'Redshift', 'Analytics', 'warehouse', 'data warehouse analytics'],
  ['vpc', 'VPC', 'Networking', 'network', 'virtual private cloud subnet'],
  ['route53', 'Route 53', 'Networking', 'network', 'dns domain'],
  ['cloudfront', 'CloudFront', 'Networking', 'cdn', 'cdn edge cache'],
  ['elb', 'Load Balancer', 'Networking', 'loadbalancer', 'elb alb nlb'],
  ['apigateway', 'API Gateway', 'Networking', 'apigw', 'api rest http'],
  ['sqs', 'SQS', 'Integration', 'queue', 'queue message'],
  ['sns', 'SNS', 'Integration', 'pubsub', 'notification topic pub sub'],
  ['eventbridge', 'EventBridge', 'Integration', 'event', 'events bus'],
  ['stepfunctions', 'Step Functions', 'Integration', 'pipeline', 'workflow orchestration state'],
  ['kinesis', 'Kinesis', 'Analytics', 'pipeline', 'stream streaming data'],
  ['cognito', 'Cognito', 'Security', 'identity', 'auth users identity'],
  ['iam', 'IAM', 'Security', 'key', 'identity access permissions'],
  ['secretsmanager', 'Secrets Manager', 'Security', 'key', 'secrets credentials'],
  ['waf', 'WAF', 'Security', 'shield', 'firewall protection'],
  ['cloudwatch', 'CloudWatch', 'Management', 'monitor', 'monitoring metrics logs'],
];

const AZURE: Row[] = [
  ['vm', 'Virtual Machine', 'Compute', 'vm', 'vm instance compute'],
  ['appservice', 'App Service', 'Compute', 'browser', 'web app hosting'],
  ['functions', 'Functions', 'Compute', 'func', 'serverless faas'],
  ['aks', 'AKS', 'Containers', 'container', 'kubernetes k8s'],
  ['aci', 'Container Instances', 'Containers', 'container', 'container docker'],
  ['acr', 'Container Registry', 'Containers', 'registry', 'image registry'],
  ['blob', 'Blob Storage', 'Storage', 'bucket', 'object storage blob'],
  ['disks', 'Managed Disks', 'Storage', 'disk', 'block storage disk'],
  ['files', 'Files', 'Storage', 'disk', 'file share'],
  ['sql', 'SQL Database', 'Database', 'database', 'sql relational'],
  ['cosmos', 'Cosmos DB', 'Database', 'table', 'nosql globally distributed'],
  ['redis', 'Cache for Redis', 'Database', 'cache', 'redis cache'],
  ['synapse', 'Synapse', 'Analytics', 'warehouse', 'data warehouse analytics'],
  ['vnet', 'Virtual Network', 'Networking', 'network', 'vnet subnet'],
  ['lb', 'Load Balancer', 'Networking', 'loadbalancer', 'load balancer'],
  ['appgw', 'Application Gateway', 'Networking', 'gateway', 'gateway waf'],
  ['frontdoor', 'Front Door', 'Networking', 'cdn', 'cdn edge'],
  ['apim', 'API Management', 'Networking', 'apigw', 'api gateway'],
  ['servicebus', 'Service Bus', 'Integration', 'queue', 'queue message'],
  ['eventgrid', 'Event Grid', 'Integration', 'event', 'events'],
  ['eventhubs', 'Event Hubs', 'Integration', 'pipeline', 'stream ingestion'],
  ['logicapps', 'Logic Apps', 'Integration', 'pipeline', 'workflow orchestration'],
  ['aad', 'Entra ID', 'Security', 'identity', 'active directory identity auth'],
  ['keyvault', 'Key Vault', 'Security', 'key', 'secrets keys'],
  ['monitor', 'Monitor', 'Management', 'monitor', 'monitoring metrics'],
];

const GCP: Row[] = [
  ['gce', 'Compute Engine', 'Compute', 'vm', 'vm instance compute'],
  ['functions', 'Cloud Functions', 'Compute', 'func', 'serverless faas'],
  ['run', 'Cloud Run', 'Compute', 'container', 'serverless container'],
  ['appengine', 'App Engine', 'Compute', 'browser', 'paas web app'],
  ['gke', 'GKE', 'Containers', 'container', 'kubernetes k8s'],
  ['artifactregistry', 'Artifact Registry', 'Containers', 'registry', 'image registry'],
  ['gcs', 'Cloud Storage', 'Storage', 'bucket', 'object storage bucket'],
  ['persistentdisk', 'Persistent Disk', 'Storage', 'disk', 'block storage disk'],
  ['sql', 'Cloud SQL', 'Database', 'database', 'sql relational postgres mysql'],
  ['spanner', 'Spanner', 'Database', 'database', 'relational distributed'],
  ['firestore', 'Firestore', 'Database', 'table', 'nosql document'],
  ['bigtable', 'Bigtable', 'Database', 'table', 'nosql wide column'],
  ['memorystore', 'Memorystore', 'Database', 'cache', 'redis cache'],
  ['bigquery', 'BigQuery', 'Analytics', 'warehouse', 'data warehouse analytics'],
  ['vpc', 'VPC', 'Networking', 'network', 'virtual private cloud subnet'],
  ['clb', 'Cloud Load Balancing', 'Networking', 'loadbalancer', 'load balancer'],
  ['cdn', 'Cloud CDN', 'Networking', 'cdn', 'cdn edge'],
  ['apigateway', 'API Gateway', 'Networking', 'apigw', 'api rest'],
  ['pubsub', 'Pub/Sub', 'Integration', 'pubsub', 'messaging queue topic'],
  ['dataflow', 'Dataflow', 'Analytics', 'pipeline', 'stream batch pipeline'],
  ['workflows', 'Workflows', 'Integration', 'pipeline', 'orchestration'],
  ['iam', 'IAM', 'Security', 'key', 'identity access'],
  ['identityplatform', 'Identity Platform', 'Security', 'identity', 'auth users'],
  ['secretmanager', 'Secret Manager', 'Security', 'key', 'secrets'],
  ['monitoring', 'Cloud Monitoring', 'Management', 'monitor', 'monitoring metrics'],
];

export const CLOUD_ICONS: IconDef[] = [
  ...pack('aws', AWS),
  ...pack('azure', AZURE),
  ...pack('gcp', GCP),
];

const BY_ID = new Map(CLOUD_ICONS.map((i) => [i.id, i] as const));

export function getIconDef(id: string): IconDef | undefined {
  return BY_ID.get(id);
}

export function iconName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function iconsByCategory(
  provider: CloudProvider,
): Array<{ category: string; icons: IconDef[] }> {
  const order: string[] = [];
  const groups = new Map<string, IconDef[]>();
  for (const icon of CLOUD_ICONS) {
    if (icon.provider !== provider) continue;
    if (!groups.has(icon.category)) {
      groups.set(icon.category, []);
      order.push(icon.category);
    }
    groups.get(icon.category)!.push(icon);
  }
  return order.map((category) => ({ category, icons: groups.get(category)! }));
}

export interface OfficialIconPack {
  provider: CloudProvider;
  attribution: string;
  icons: Array<{ id: string; body: string }>;
}

const OFFICIAL_BODY = new Map<string, string>();
const OFFICIAL_LOADED = new Set<CloudProvider>();
const OFFICIAL_ATTRIBUTION = new Map<CloudProvider, string>();

export function registerOfficialPack(pack: OfficialIconPack): number {
  let n = 0;
  for (const { id, body } of pack.icons) {
    if (!BY_ID.has(id) || !body) continue;
    OFFICIAL_BODY.set(id, body);
    imageCache.delete(id);
    n += 1;
  }
  if (n > 0) {
    OFFICIAL_LOADED.add(pack.provider);
    OFFICIAL_ATTRIBUTION.set(pack.provider, pack.attribution);
    notifyAssetReady();
  }
  return n;
}

export function clearOfficialPacks(): void {
  for (const id of OFFICIAL_BODY.keys()) imageCache.delete(id);
  OFFICIAL_BODY.clear();
  OFFICIAL_LOADED.clear();
  OFFICIAL_ATTRIBUTION.clear();
  notifyAssetReady();
}

export function officialProvidersLoaded(): CloudProvider[] {
  return [...OFFICIAL_LOADED];
}

export function officialAttributions(): string[] {
  return [...OFFICIAL_ATTRIBUTION.values()];
}

export function hasOfficialIcon(id: string): boolean {
  return OFFICIAL_BODY.has(id);
}

function bodyFor(id: string): string | null {
  return OFFICIAL_BODY.get(id) ?? BY_ID.get(id)?.body ?? null;
}

// SVG and raster helpers

export function iconToSvg(id: string, size = 48): string {
  const body = bodyFor(id);
  if (body === null) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">${body}</svg>`;
}

export function iconInner(id: string): { viewBox: string; body: string } | null {
  const body = bodyFor(id);
  return body === null ? null : { viewBox: '0 0 48 48', body };
}

export function iconDataUri(id: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(iconToSvg(id))}`;
}

// Icon decoding is asynchronous, so the canvas repaints when cached images are ready.

interface CachedImage {
  img: HTMLImageElement;
  ready: boolean;
}

const imageCache = new Map<string, CachedImage>();

/**
 * The board registers a repaint here so late-loading icons appear. The
 * callback is shared with the bitmap image cache (images.ts) via ready.ts,
 * so image decodes repaint through the same registration.
 */
export function setIconReadyCallback(cb: (() => void) | null): void {
  setAssetReadyCallback(cb);
}

export function getIconImage(id: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !BY_ID.has(id)) return null;
  const cached = imageCache.get(id);
  if (cached) return cached.ready ? cached.img : null;
  const img = new Image();
  const entry: CachedImage = { img, ready: false };
  img.onload = () => {
    entry.ready = true;
    notifyAssetReady();
  };
  img.src = iconDataUri(id);
  imageCache.set(id, entry);
  return null;
}

export async function preloadIcons(ids: string[]): Promise<void> {
  if (typeof Image === 'undefined') return;
  await Promise.all(
    [...new Set(ids)].map(
      (id) =>
        new Promise<void>((resolve) => {
          if (!BY_ID.has(id)) return resolve();
          const existing = imageCache.get(id);
          if (existing?.ready) return resolve();
          const img = existing?.img ?? new Image();
          if (img.complete && img.naturalWidth) return resolve();
          img.onload = () => {
            imageCache.set(id, { img, ready: true });
            resolve();
          };
          img.onerror = () => resolve();
          if (!existing) {
            imageCache.set(id, { img, ready: false });
            img.src = iconDataUri(id);
          }
        }),
    ),
  );
}

// Free-text icon resolution

const TOKEN_INDEX: Array<{ id: string; tokens: Set<string>; provider: CloudProvider }> =
  CLOUD_ICONS.map((icon) => ({
    id: icon.id,
    provider: icon.provider,
    tokens: new Set(
      [icon.name, icon.category, ...icon.keywords, icon.id.split(':')[1]]
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    ),
  }));

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Best-effort map from a free-text label/kind to an icon id.
 * Exact `provider:slug` wins; otherwise a keyword overlap score, optionally
 * constrained to a preferred provider.
 */
export function resolveIconId(text: string, preferred?: CloudProvider): string | null {
  if (!text) return null;
  const raw = norm(text);
  if (BY_ID.has(raw)) return raw;

  const words = raw.split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  const wordSet = new Set(words);

  let best: string | null = null;
  let bestScore = 0;
  for (const entry of TOKEN_INDEX) {
    let score = 0;
    for (const w of wordSet) {
      if (entry.tokens.has(w)) score += w.length >= 4 ? 3 : 2;
    }
    if (score === 0) continue;
    if (preferred && entry.provider === preferred) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = entry.id;
    }
  }
  return bestScore >= 3 ? best : null;
}

export function detectProvider(text: string): CloudProvider | undefined {
  const t = norm(text);
  if (/\b(aws|amazon)\b/.test(t)) return 'aws';
  if (/\b(azure|microsoft)\b/.test(t)) return 'azure';
  if (/\b(gcp|google)\b/.test(t)) return 'gcp';
  return undefined;
}
