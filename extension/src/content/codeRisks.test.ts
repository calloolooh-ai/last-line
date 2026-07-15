import { describe, it, expect } from "vitest";
import { detectCodeRisks } from "./codeRisks";

describe("detectCodeRisks", () => {
  it("flags a hardcoded API key inside a code block", () => {
    const response = "Here's your client:\n```js\nconst key = \"sk-live-abc123def456ghi789\";\n```";
    const risks = detectCodeRisks(response);
    expect(risks.some((r) => r.type === "hardcoded_secret")).toBe(true);
  });

  it("flags SQL built via string concatenation", () => {
    const response = "```js\nconst q = \"SELECT * FROM users WHERE id = \" + userId;\n```";
    const risks = detectCodeRisks(response);
    expect(risks.some((r) => r.type === "sql_injection")).toBe(true);
  });

  it("flags eval() usage", () => {
    const response = "```js\nfunction run(input) {\n  return eval(input);\n}\n```";
    const risks = detectCodeRisks(response);
    expect(risks.some((r) => r.type === "eval_usage")).toBe(true);
  });

  it("flags shell command built from a variable", () => {
    const response = "```js\nchild_process.exec(\"rm \" + filename);\n```";
    const risks = detectCodeRisks(response);
    expect(risks.some((r) => r.type === "command_injection")).toBe(true);
  });

  it("flags unguarded innerHTML assignment", () => {
    const response = "```js\nel.innerHTML = userComment;\n```";
    const risks = detectCodeRisks(response);
    expect(risks.some((r) => r.type === "unsafe_dom_write")).toBe(true);
  });

  it("does not flag clean, parameterized code", () => {
    const response =
      "```js\nconst rows = await db.query('SELECT * FROM users WHERE id = ?', [userId]);\nel.textContent = message;\n```";
    const risks = detectCodeRisks(response);
    expect(risks).toHaveLength(0);
  });

  it("ignores prose outside code fences", () => {
    const response = "You should never eval() user input or build SQL with string concatenation.";
    const risks = detectCodeRisks(response);
    expect(risks).toHaveLength(0);
  });
});
