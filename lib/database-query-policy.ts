import { Parser } from "node-sql-parser";

export type DatabaseEngine = "postgresql" | "mysql";

const parser = new Parser();
const MAX_SQL_BYTES = 20 * 1024;
const WRITE_OR_RISKY_SQL = [
  /\b(?:insert|update|delete|merge|replace|upsert|create|alter|drop|truncate|grant|revoke)\b/i,
  /\b(?:call|execute|prepare|deallocate|do|copy|load\s+data|lock|unlock)\b/i,
  /\bselect\b[\s\S]*\binto\b/i,
  /\bfor\s+(?:update|share|no\s+key\s+update|key\s+share)\b/i,
  /\b(?:into\s+outfile|into\s+dumpfile)\b/i,
];

function stripLeadingComments(sql: string) {
  return sql
    .replace(/^\uFEFF/, "")
    .replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)+/, "")
    .trim();
}

export type SqlAnalysis = {
  sql: string;
  statementType: string;
  readOnly: boolean;
};

export function analyzeSql(sqlValue: string, engine: DatabaseEngine): SqlAnalysis {
  const sql = sqlValue.trim();
  if (!sql) throw new Error("SQL 不能为空");
  if (Buffer.byteLength(sql, "utf8") > MAX_SQL_BYTES) throw new Error("SQL 不能超过 20 KB");

  const leading = stripLeadingComments(sql);

  let ast: unknown;
  try {
    const parsedSql = /^explain\b/i.test(leading)
      ? leading.replace(/^explain(?:\s+\([^)]*\)|\s+analyze)?\s+/i, "")
      : sql;
    ast = parser.astify(parsedSql, { database: engine === "postgresql" ? "Postgresql" : "MySQL" });
  } catch {
    throw new Error("SQL 语法无法解析");
  }
  if (Array.isArray(ast)) {
    if (ast.length !== 1) throw new Error("每次只能执行一条 SQL");
    ast = ast[0];
  }

  const type = String((ast as { type?: string }).type || "").toLowerCase();
  const readOnlyType = ["select", "show", "desc", "describe"].includes(type);
  const readOnly = readOnlyType && !WRITE_OR_RISKY_SQL.some((pattern) => pattern.test(sql));
  return {
    sql,
    statementType: /^explain\b/i.test(leading) ? "explain" : type || "unknown",
    readOnly,
  };
}

export function validateReadOnlySql(sqlValue: string, engine: DatabaseEngine) {
  const analysis = analyzeSql(sqlValue, engine);
  if (!analysis.readOnly) throw new Error("SQL 不是受支持的只读语句");
  return analysis.sql;
}
