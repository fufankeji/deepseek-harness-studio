import type {
  OverviewResponse,
  DocumentsListResponse,
  DocumentsQuery,
  UploadDocumentResult,
  DocumentProcessingResponse,
  DemoSeedResult,
  ReprocessResult,
  WikiListResponse,
  WikiPageDetail,
  WikiQuery,
  WikiRecompileResult,
  GraphOverviewResponse,
  GraphExtractResult,
  GraphNodesResponse,
  GraphEdgesResponse,
  GraphNodeType,
  GraphEdgeSemantic,
  EvalLatestResponse,
  DocumentDetailResponse,
  UpdateDocumentRequest,
  UpdateDocumentResult,
  DeleteDocumentResult,
} from "@llmwiki/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * 读取首页总览。API 不可用时由调用方使用演示数据兜底。
 * 前端优先读取 API：请求成功则返回实时数据，否则抛错。
 */
export async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch(`${API_BASE}/api/overview`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });

  if (!res.ok) {
    throw new Error(`API 请求失败：${res.status}`);
  }

  return (await res.json()) as OverviewResponse;
}

/**
 * 读取资料中心列表（搜索 + 状态筛选 + 分页）。
 * 失败时抛出，由调用方决定兜底或展示错误态。
 */
export async function fetchDocuments(query: DocumentsQuery): Promise<DocumentsListResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.kind && query.kind !== "all") params.set("kind", query.kind);
  if (query.topic && query.topic !== "all") params.set("topic", query.topic);
  if (query.origin && query.origin !== "all") params.set("origin", query.origin);
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 10));

  const res = await fetch(`${API_BASE}/api/documents?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`资料列表请求失败：${res.status}`);
  }

  return (await res.json()) as DocumentsListResponse;
}

/**
 * 上传一份资料（multipart）。后端负责类型校验与 sha256 去重。
 * 校验失败 / 重复时后端仍返回结构化 JSON（ok=false / duplicate=true）。
 */
export async function uploadDocument(file: File): Promise<UploadDocumentResult> {
  const form = new FormData();
  form.append("file", file, file.name);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/documents`, {
      method: "POST",
      body: form,
    });
  } catch {
    return {
      ok: false,
      duplicate: false,
      document: null,
      message: "无法连接导入服务，请确认服务已启动后重试",
    };
  }

  try {
    return (await res.json()) as UploadDocumentResult;
  } catch {
    return {
      ok: false,
      duplicate: false,
      document: null,
      message: "导入失败，服务返回异常，请稍后重试",
    };
  }
}

/** 读取一份上传资料的真实解析与入库进度。 */
export async function fetchDocumentProcessing(
  id: string,
): Promise<DocumentProcessingResponse> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(id)}/processing`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) {
    throw new Error(`处理进度请求失败：${res.status}`);
  }
  return (await res.json()) as DocumentProcessingResponse;
}

/** 读取资料正文、分段、处理任务与关联 Wiki。 */
export async function fetchDocumentDetail(id: string): Promise<DocumentDetailResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`资料详情请求失败：${res.status}`);
  return (await res.json()) as DocumentDetailResponse;
}

export async function updateDocument(
  id: string,
  patch: UpdateDocumentRequest,
): Promise<UpdateDocumentResult> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json()) as UpdateDocumentResult;
  if (!res.ok) throw new Error(body.message || `资料更新失败：${res.status}`);
  return body;
}

export async function deleteDocument(id: string): Promise<DeleteDocumentResult> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json()) as DeleteDocumentResult;
  if (!res.ok) throw new Error(body.message || `资料删除失败：${res.status}`);
  return body;
}

/** 载入演示资料（幂等：已存在则跳过）。 */
export async function seedDemoDocuments(): Promise<DemoSeedResult> {
  const res = await fetch(`${API_BASE}/api/documents/demo-seed`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`载入演示资料失败：${res.status}`);
  }
  return (await res.json()) as DemoSeedResult;
}

/** 重新处理一份异常资料。 */
export async function reprocessDocument(id: string): Promise<ReprocessResult> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/reprocess`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`重新处理失败：${res.status}`);
  }
  return (await res.json()) as ReprocessResult;
}

/** 读取 Wiki 列表（搜索 + 类型筛选）。 */
export async function fetchWikiList(query: WikiQuery = {}): Promise<WikiListResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.type && query.type !== "all") params.set("type", query.type);

  const res = await fetch(`${API_BASE}/api/wiki?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Wiki 列表请求失败：${res.status}`);
  }
  return (await res.json()) as WikiListResponse;
}

/** 读取单页 Wiki 详情。 */
export async function fetchWikiPage(slug: string): Promise<WikiPageDetail> {
  const res = await fetch(`${API_BASE}/api/wiki/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Wiki 页面请求失败：${res.status}`);
  }
  return (await res.json()) as WikiPageDetail;
}

/** 触发重新编译（真实重跑编译器并更新产物）。 */
export async function recompileWiki(): Promise<WikiRecompileResult> {
  const res = await fetch(`${API_BASE}/api/wiki/recompile`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`重新编译失败：${res.status}`);
  }
  return (await res.json()) as WikiRecompileResult;
}

/** 读取知识图谱概览（统计全部来自 output/ 真实产物）。 */
export async function fetchGraphOverview(): Promise<GraphOverviewResponse> {
  const res = await fetch(`${API_BASE}/api/graph`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`图谱概览请求失败：${res.status}`);
  }
  return (await res.json()) as GraphOverviewResponse;
}

/** 读取图谱节点列表（可按类型筛选）。 */
export async function fetchGraphNodes(type?: GraphNodeType): Promise<GraphNodesResponse> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);

  const res = await fetch(`${API_BASE}/api/graph/nodes?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`图谱节点请求失败：${res.status}`);
  }
  return (await res.json()) as GraphNodesResponse;
}

/** 读取图谱边列表（可按语义筛选）。 */
export async function fetchGraphEdges(semantic?: GraphEdgeSemantic): Promise<GraphEdgesResponse> {
  const params = new URLSearchParams();
  if (semantic) params.set("semantic", semantic);

  const res = await fetch(`${API_BASE}/api/graph/edges?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`图谱边请求失败：${res.status}`);
  }
  return (await res.json()) as GraphEdgesResponse;
}

/** 触发重新抽取（真实重跑本地规则管道并更新生成时间）。 */
export async function reextractGraph(): Promise<GraphExtractResult> {
  const res = await fetch(`${API_BASE}/api/graph/extract`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`图谱重新抽取失败：${res.status}`);
  }
  return (await res.json()) as GraphExtractResult;
}

/** 读取最近一次问答评估报告（含基线与优化前后对比）。 */
export async function fetchEvaluation(): Promise<EvalLatestResponse> {
  const res = await fetch(`${API_BASE}/api/evaluation/latest`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`评估报告请求失败：${res.status}`);
  }
  return (await res.json()) as EvalLatestResponse;
}
