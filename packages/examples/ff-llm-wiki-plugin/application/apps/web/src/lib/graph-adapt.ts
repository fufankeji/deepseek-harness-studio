import type { GraphEdge, GraphNode, GraphNodeType, GraphEdgeSemantic } from "@llmwiki/contracts";

/**
 * 知识图谱数据适配层（STAGE-07B）
 *
 * 唯一职责：把 /api/graph 返回的真实节点/边，适配成「深空 3D 视图」与
 * 「结构视图」共用的同一份投影数据。原则（见 knowledge-graph-viz-pack）：
 *   - 类型 → 领域色（≤8，本项目 4 类 → 4 色）
 *   - 预计算 degree（节点大小依据）
 *   - 边权重按语义标注（用于降噪/宽度/粒子）
 *   - 布局使用固定 seed 的 mulberry32，刷新可复现
 *   - 不写 fixture、不散写节点进组件
 */

/** 节点类型 → 业务语言标签 */
export const NODE_TYPE_LABEL: Record<GraphNodeType, string> = {
  PAGE: "知识页",
  SOURCE: "来源文档",
  TOPIC: "主题",
  PAGE_TYPE: "页面类型",
};

/** 节点类型顺序（图例 / 筛选 / 布局扇区按此稳定排列） */
export const NODE_TYPE_ORDER: GraphNodeType[] = ["PAGE", "SOURCE", "TOPIC", "PAGE_TYPE"];

/**
 * 领域色：已通过随包校验器四项机检（暗色 surface #04060d）。
 *   命令：node .agents/skills/knowledge-graph-viz-pack/scripts/validate_palette.js \
 *         "#3b82f6,#d97706,#0d9488,#d946ef" --mode dark --surface "#04060d"
 */
export const NODE_TYPE_COLOR: Record<GraphNodeType, string> = {
  PAGE: "#86d8bb",
  SOURCE: "#c99a4a",
  TOPIC: "#f2d166",
  PAGE_TYPE: "#6f93a7",
};

/** 边语义 → 业务语言标签 */
export const SEMANTIC_LABEL: Record<GraphEdgeSemantic, string> = {
  LINKS_TO: "内链",
  HAS_SOURCE: "来源",
  HAS_TOPIC: "主题",
  HAS_TYPE: "类型",
};

/** 边语义顺序（筛选 / 图例按此稳定排列） */
export const SEMANTIC_ORDER: GraphEdgeSemantic[] = ["LINKS_TO", "HAS_SOURCE", "HAS_TOPIC", "HAS_TYPE"];

/**
 * 边权重：语义主干优先。内链是知识互链骨架（最高），来源/主题次之，
 * 「类型」只是页面归类，最弱——用于默认降噪与线条粗细/透明度。
 */
export const SEMANTIC_WEIGHT: Record<GraphEdgeSemantic, number> = {
  LINKS_TO: 2.0,
  HAS_SOURCE: 1.3,
  HAS_TOPIC: 1.3,
  HAS_TYPE: 0.6,
};

/** 默认降噪：默认不显示最弱的「类型」归类边，避免满屏径向连线。 */
export const DEFAULT_VISIBLE_SEMANTICS: GraphEdgeSemantic[] = ["HAS_TOPIC"];

/** 固定布局种子（保证刷新后可复现） */
export const LAYOUT_SEED = 20260714;

/** 深空主题底色（与机检 surface 一致） */
export const SPACE_BACKGROUND = "#071012";

export interface AdaptedNode {
  id: string;
  /** 展示名（主题/页面类型节点用 label 中文名，其余用 name） */
  name: string;
  /** API 原始名（如英文 slug，工具提示用） */
  rawName: string;
  type: GraphNodeType;
  /** 领域索引（NODE_TYPE_ORDER 下标） */
  domain: number;
  /** 连接度（预计算） */
  degree: number;
  source_doc: string;
  /** 页面类型 / 主题节点带的中文标签 */
  label?: string;
  /** 确定性布局坐标（computeDeterministicLayout 写入） */
  x?: number;
  y?: number;
  z?: number;
}

export interface AdaptedLink {
  source: string;
  target: string;
  semantic: GraphEdgeSemantic;
  weight: number;
  label: string;
}

export interface AdaptedGraph {
  nodes: AdaptedNode[];
  links: AdaptedLink[];
  byId: Map<string, AdaptedNode>;
  degree: Map<string, number>;
}

/** mulberry32 种子随机：与 Skill 契约一致，保证布局可复现 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 节点展示名：有中文 label 优先，否则用 API name */
export function nodeDisplayName(node: GraphNode): string {
  return node.label?.trim() || node.name;
}

/**
 * 把 API 原始节点/边适配成统一投影：
 *   - 预计算 degree
 *   - type → domain（领域色索引）
 *   - semantic → weight
 * 返回的 nodes/links 数量与输入严格一致，供对账。
 */
export function adaptGraph(nodes: GraphNode[], edges: GraphEdge[]): AdaptedGraph {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const adaptedNodes: AdaptedNode[] = nodes.map((n) => ({
    id: n.id,
    name: nodeDisplayName(n),
    rawName: n.name,
    type: n.type,
    domain: NODE_TYPE_ORDER.indexOf(n.type),
    degree: degree.get(n.id) ?? 0,
    source_doc: n.source_doc,
    label: n.label,
  }));

  const byId = new Map<string, AdaptedNode>();
  for (const n of adaptedNodes) byId.set(n.id, n);

  const adaptedLinks: AdaptedLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    semantic: e.semantic,
    weight: SEMANTIC_WEIGHT[e.semantic] ?? 1,
    label: e.label ?? SEMANTIC_LABEL[e.semantic],
  }));

  return { nodes: adaptedNodes, links: adaptedLinks, byId, degree };
}

/**
 * 确定性 3D 布局：固定 seed，刷新结果一致。
 *   - 按类型分扇区（同类型聚成一片「星区」）
 *   - 径向半径按 degree 归一（连接度越高越靠中心，形成层次）
 *   - z 轴按 degree 扩散（枢纽更贴近赤道面，叶子向外铺开）
 * 写入每个节点的 x/y/z。
 */
export function computeDeterministicLayout(graph: AdaptedGraph, seed = LAYOUT_SEED): void {
  const rand = mulberry32(seed);
  const { nodes } = graph;
  if (nodes.length === 0) return;

  const maxDegree = Math.max(1, ...nodes.map((n) => n.degree));
  const domainCount = NODE_TYPE_ORDER.length;

  const byDomain = new Map<number, AdaptedNode[]>();
  for (const n of nodes) {
    const arr = byDomain.get(n.domain) ?? [];
    arr.push(n);
    byDomain.set(n.domain, arr);
  }

  for (const n of nodes) {
    const group = byDomain.get(n.domain)!;
    const idxInGroup = group.indexOf(n);
    const frac = group.length > 1 ? idxInGroup / (group.length - 1) : 0.5;

    // 扇区中心角：4 类均分圆周
    const sectorCenter = (n.domain / domainCount) * Math.PI * 2;
    const sectorSpan = ((Math.PI * 2) / domainCount) * 0.66;
    const azimuth = sectorCenter + (frac - 0.5) * sectorSpan + (rand() - 0.5) * 0.12;

    const dNorm = n.degree / maxDegree;
    const radius = 120 + (1 - dNorm) * 165 + (rand() - 0.5) * 20;
    const zSpread = 44 + (1 - dNorm) * 90;

    n.x = radius * Math.cos(azimuth);
    n.y = radius * Math.sin(azimuth);
    n.z = (rand() - 0.5) * zSpread;
  }
}

/** 对账：断言适配后的节点/边数与源一致，返回可读摘要（供脚本与 HUD 使用） */
export function reconcile(adapted: AdaptedGraph, sourceNodes: number, sourceEdges: number): string {
  const degreeSum = adapted.nodes.reduce((s, n) => s + n.degree, 0);
  const linkEnds = adapted.links.length * 2;
  if (adapted.nodes.length !== sourceNodes) {
    throw new Error(`节点对账失败：适配 ${adapted.nodes.length} != 源 ${sourceNodes}`);
  }
  if (adapted.links.length !== sourceEdges) {
    throw new Error(`边对账失败：适配 ${adapted.links.length} != 源 ${sourceEdges}`);
  }
  if (degreeSum !== linkEnds) {
    throw new Error(`度数对账失败：degree 和 ${degreeSum} != 边端点数 ${linkEnds}`);
  }
  return `${sourceNodes} 节点 / ${sourceEdges} 边 · 度数守恒 ${degreeSum} = ${linkEnds}`;
}
