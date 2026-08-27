import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  DocumentIcon,
  WikiIcon,
  GraphIcon,
  QaIcon,
  EvalIcon,
  SettingsIcon,
} from "../components/Icons";

export interface NavItem {
  href: string;
  label: string;
  /** 仅精确匹配（用于首页「/」） */
  exact?: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV: NavItem[] = [
  { href: "/", label: "知识工作台", exact: true, icon: DashboardIcon },
  { href: "/documents", label: "企业文档管理", icon: DocumentIcon },
  { href: "/wiki", label: "Wiki 知识库", icon: WikiIcon },
  { href: "/knowledge-graph", label: "知识图谱", icon: GraphIcon },
  { href: "/ask", label: "Agent 智能问答", icon: QaIcon },
  { href: "/evaluation", label: "评估与优化", icon: EvalIcon },
  { href: "/settings", label: "系统设置", icon: SettingsIcon },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
