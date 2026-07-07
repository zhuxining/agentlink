// jest-dom 的 DOM 匹配器仅在 DOM 环境（jsdom）下需要；纯逻辑测试用 node 环境时跳过，
// 避免在无 document 的运行时加载 DOM 相关依赖。
if (typeof globalThis.document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
