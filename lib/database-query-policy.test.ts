import { describe, expect, it } from "vitest";
import { analyzeSql, validateReadOnlySql } from "./database-query-policy";
import { decideDatabaseQuery, type DatabaseQueryPolicy } from "./database-management";

describe("validateReadOnlySql", () => {
  it.each([
    ["SELECT * FROM users LIMIT 10", "postgresql"],
    ["SELECT * FROM public.tk_api;", "postgresql"],
    ["WITH recent AS (SELECT id FROM jobs) SELECT * FROM recent", "postgresql"],
    ["SHOW TABLES", "mysql"],
    ["DESCRIBE users", "mysql"],
    ["EXPLAIN SELECT * FROM users", "postgresql"],
  ] as const)("allows %s", (sql, engine) => {
    expect(validateReadOnlySql(sql, engine)).toBe(sql);
  });

  it.each([
    "SELECT 1; SELECT 2",
    "INSERT INTO users(id) VALUES (1)",
    "WITH changed AS (DELETE FROM jobs RETURNING *) SELECT * FROM changed",
    "SELECT * FROM users FOR UPDATE",
    "COPY users TO STDOUT",
    "SELECT * FROM users INTO OUTFILE '/tmp/users'",
    "CALL refresh_cache()",
    "DROP TABLE users",
    "/* harmless */ UPDATE users SET name='x'",
  ])("rejects unsafe SQL: %s", (sql) => {
    expect(() => validateReadOnlySql(sql, "postgresql")).toThrow();
  });
});

describe("database SQL policy", () => {
  const policy = (input: Partial<DatabaseQueryPolicy>): DatabaseQueryPolicy => ({
    id: "1", name: "policy", pattern: "^$", action: "deny", priority: 50,
    enabled: true, createdAt: new Date(0).toISOString(), ...input,
  });

  it("allows read-only SQL by default", () => {
    const analysis = analyzeSql("SELECT 1", "postgresql");
    expect(decideDatabaseQuery(analysis.sql, analysis, []).allowed).toBe(true);
  });

  it("denies writes by default and permits a matching allow", () => {
    const analysis = analyzeSql("UPDATE jobs SET status='done' WHERE id=1", "postgresql");
    expect(decideDatabaseQuery(analysis.sql, analysis, []).allowed).toBe(false);
    expect(decideDatabaseQuery(analysis.sql, analysis, [
      policy({ name: "allow jobs", pattern: "^UPDATE\\s+jobs\\s+SET", action: "allow" }),
    ]).allowed).toBe(true);
  });

  it("uses the first enabled policy in priority order", () => {
    const analysis = analyzeSql("DELETE FROM users WHERE id=1", "mysql");
    const decision = decideDatabaseQuery(analysis.sql, analysis, [
      policy({ name: "protect users", pattern: "^DELETE\\s+FROM\\s+users", action: "deny", priority: 10 }),
      policy({ name: "allow deletes", pattern: "^DELETE", action: "allow", priority: 50 }),
    ]);
    expect(decision).toEqual({ allowed: false, reason: "匹配数据库策略：protect users" });
  });
});
