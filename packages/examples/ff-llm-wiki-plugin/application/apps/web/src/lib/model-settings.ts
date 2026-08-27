import type { QaModelId } from "@llmwiki/contracts";

export const MODEL_PREFS_KEY = "llmwiki-qa-model-preferences";
export const MODEL_PREFS_EVENT = "llmwiki-model-preferences-change";

export interface ModelPreferences {
  generationMode: "deepseek" | "local";
  model: QaModelId;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_MODEL_PREFERENCES: ModelPreferences = {
  generationMode: "deepseek",
  model: "deepseek-v4-flash",
  temperature: 0.2,
  maxTokens: 1200,
};

export function normalizeModelPreferences(value: Partial<ModelPreferences>): ModelPreferences {
  const requestedModel = String(value.model ?? "");
  const model = requestedModel === "deepseek-v4-pro" || requestedModel === "deepseek-reasoner"
    ? "deepseek-v4-pro"
    : "deepseek-v4-flash";
  const temperature = Number.isFinite(value.temperature)
    ? Math.min(1.5, Math.max(0, Number(value.temperature)))
    : DEFAULT_MODEL_PREFERENCES.temperature;
  const maxTokens = Number.isFinite(value.maxTokens)
    ? Math.round(Math.min(4096, Math.max(256, Number(value.maxTokens))))
    : DEFAULT_MODEL_PREFERENCES.maxTokens;

  return {
    generationMode: value.generationMode === "local" ? "local" : "deepseek",
    model,
    temperature,
    maxTokens,
  };
}

export function loadModelPreferences(): ModelPreferences {
  try {
    const saved = localStorage.getItem(MODEL_PREFS_KEY);
    return saved
      ? normalizeModelPreferences(JSON.parse(saved) as Partial<ModelPreferences>)
      : DEFAULT_MODEL_PREFERENCES;
  } catch {
    return DEFAULT_MODEL_PREFERENCES;
  }
}

export function saveModelPreferences(value: ModelPreferences): ModelPreferences {
  const normalized = normalizeModelPreferences(value);
  localStorage.setItem(MODEL_PREFS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(MODEL_PREFS_EVENT, { detail: normalized }));
  return normalized;
}
