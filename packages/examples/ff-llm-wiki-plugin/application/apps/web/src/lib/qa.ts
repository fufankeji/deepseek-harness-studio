import type {
  QaConnectionTestResponse,
  QaModelConfigResponse,
  QaRequest,
  QaResponse,
} from "@llmwiki/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** SSE 事件负载（server 逐块下发，与 /api/qa/stream 契约一致） */
type QaChunk =
  | { type: "meta"; status: string; confidence: string; metrics: QaResponse["metrics"]; compiledAt: string; mode: QaResponse["mode"]; model: string; providerConfigured: boolean }
  | { type: "generation"; generation: QaResponse["generation"]; mode: QaResponse["mode"] }
  | { type: "delta"; text: string }
  | { type: "answer_complete"; answers: QaResponse["answers"] }
  | { type: "answer"; answer: QaResponse["answers"][number] }
  | { type: "citations"; citations: QaResponse["citations"] }
  | { type: "fallback"; fallback: QaResponse["fallback"] }
  | { type: "done" };

/**
 * 流式问答：fetch POST /api/qa/stream，逐块读取 SSE 事件并回调。
 * onChunk 每次收到一个已解析的事件；onDone 在 done 后回调；onError 收网络/解析错误。
 */
export async function streamQa(
  question: string,
  options: Omit<QaRequest, "question">,
  onChunk: (chunk: QaChunk) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/qa/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question, ...options }),
    });
  } catch {
    onError("无法连接问答服务，请确认服务已启动后重试");
    return;
  }

  if (!res.ok || !res.body) {
    onError(`问答请求失败：${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔；逐条解析 "data: {...}"
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = raw
          .split("\n")
          .find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const json = dataLine.slice("data: ".length);
          const chunk = JSON.parse(json) as QaChunk;
          onChunk(chunk);
          if (chunk.type === "done") {
            onDone();
            return;
          }
        } catch {
          // 半包或畸形块：跳过，等下一块
        }
      }
    }
    onDone();
  } catch {
    onError("流式读取中断，请重试");
  }
}

export async function getQaModelConfig(): Promise<QaModelConfigResponse> {
  const response = await fetch(`${API_BASE}/api/qa/config`, { cache: "no-store" });
  if (!response.ok) throw new Error(`读取模型配置失败：${response.status}`);
  return response.json() as Promise<QaModelConfigResponse>;
}

export async function testQaModelConnection(
  model: QaRequest["model"],
): Promise<QaConnectionTestResponse> {
  const response = await fetch(`${API_BASE}/api/qa/config/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) throw new Error(`连接测试失败：${response.status}`);
  return response.json() as Promise<QaConnectionTestResponse>;
}
