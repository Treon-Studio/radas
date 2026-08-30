// Tiny safe expression evaluator for ontology alert rules
// (contracts/domain-ontology.json, "alerts").
//
// Grammar:
//   and        := comparison (&& comparison)*
//   comparison := operand (==|!=|>=|<=|>|<) operand
//   operand    := path | literal
//   path       := dotted identifier resolved against the status payload
//                 (unknown paths throw)
//   literal    := integer, float, or double-quoted string
//
// No eval, no Function constructor, no side-effecting tokens: anything the
// tokenizer/parser does not recognize throws. Both sides of a comparison may
// be paths (e.g. `budget.usage_pct >= budget.alert_at_pct`).

function tokenize(input) {
  const tokens = [];
  const re = /(\s+|==|!=|>=|<=|&&|\|\||[()>!<]|-?\d+(?:\.\d+)?|"[^"]*"|[A-Za-z_][A-Za-z0-9_.]*)/g;
  let match, last = 0;
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) {
      const skipped = input.slice(last, match.index);
      if (skipped.trim() !== "") throw new Error(`unsupported syntax: ${skipped}`);
    }
    last = re.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
  }
  if (input.slice(last).trim() !== "") throw new Error("unsupported syntax at end");
  return tokens;
}

function resolvePath(status, path) {
  let cur = status;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) {
      throw new Error(`unknown status path: ${path}`);
    }
    cur = cur[part];
  }
  return cur;
}

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function parseLiteral(token) {
  if (token.startsWith('"')) return token.slice(1, -1);
  const n = Number(token);
  if (Number.isNaN(n)) throw new Error(`bad literal: ${token}`);
  return n;
}

// An operand is a literal (quoted string or number) or a status path.
function parseOperand(token, status) {
  if (typeof token !== "string") throw new Error("unexpected end of expression");
  if (token.startsWith('"') || /^-?\d+(?:\.\d+)?$/.test(token)) {
    return parseLiteral(token);
  }
  if (PATH_RE.test(token)) return resolvePath(status, token);
  throw new Error(`expected path or literal, got ${token}`);
}

class Parser {
  constructor(tokens, status) {
    this.tokens = tokens;
    this.i = 0;
    this.status = status;
  }
  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  parseAnd() {
    let left = this.parseComparison();
    while (this.peek() === "&&") {
      this.next();
      const right = this.parseComparison();
      left = left && right;
    }
    return left;
  }
  parseComparison() {
    const leftToken = this.next();
    if (!PATH_RE.test(leftToken)) throw new Error(`expected path, got ${leftToken}`);
    const left = resolvePath(this.status, leftToken);
    const op = this.next();
    if (!["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
      throw new Error(`expected comparison operator, got ${op}`);
    }
    const right = parseOperand(this.next(), this.status);
    switch (op) {
      case "==": return left == right;   // loose: number-vs-number, string-vs-string
      case "!=": return left != right;
      case ">=": return left >= right;
      case "<=": return left <= right;
      case ">": return left > right;
      case "<": return left < right;
    }
  }
}

function evaluateAlert(rule, status) {
  if (!rule || typeof rule.when !== "string") throw new Error("rule has no `when` expression");
  const tokens = tokenize(rule.when);
  if (tokens.length === 0) throw new Error("empty expression");
  const parser = new Parser(tokens, status);
  const result = parser.parseAnd();
  if (parser.i !== tokens.length) throw new Error("trailing tokens in expression");
  return Boolean(result);
}

function evaluateAll(rules, status) {
  const out = {};
  for (const [id, rule] of Object.entries(rules)) {
    out[id] = evaluateAlert(rule, status);
  }
  return out;
}

module.exports = { evaluateAlert, evaluateAll };
