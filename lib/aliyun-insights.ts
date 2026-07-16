import BssOpenApi, { QueryAccountBillRequest } from "@alicloud/bssopenapi20171214";
import Ims, { GetAccessKeyLastUsedRequest, ListAccessKeysRequest } from "@alicloud/ims20190815";
import { Config } from "@alicloud/openapi-client";
import ResourceCenter, { SearchResourcesRequest } from "@alicloud/resourcecenter20221201";
import { RuntimeOptions } from "@alicloud/tea-util";
import { fetchAliyunOverview } from "./aliyun";

export type InsightCredentials = {
  id: string;
  name: string;
  accessKeyId: string;
  accessKeySecret: string;
  site: "china" | "international";
};

export type CloudResource = {
  id: string;
  name: string;
  type: string;
  product: string;
  region: string;
  zone: string;
  createdAt: string;
  expiresAt: string;
  resourceGroupId: string;
  ips: string[];
  tags: { key: string; value: string }[];
};

export type AccountResources = {
  account: Pick<InsightCredentials, "id" | "name" | "site">;
  resources: CloudResource[];
  counts: { product: string; count: number }[];
  error?: string;
};

export type MonthlyCost = {
  month: string;
  gross: number;
  payable: number;
  discount: number;
  currency: string;
};

export type ProductCost = {
  product: string;
  gross: number;
  payable: number;
  discount: number;
  currency: string;
};

export type AccountCosts = {
  account: Pick<InsightCredentials, "id" | "name" | "site">;
  months: MonthlyCost[];
  products: ProductCost[];
  error?: string;
};

export type CloudRisk = {
  id: string;
  level: "critical" | "warning" | "info";
  category: "费用" | "资源" | "安全" | "可用性";
  title: string;
  detail: string;
  resource?: string;
};

export type AccountRisks = {
  account: Pick<InsightCredentials, "id" | "name" | "site">;
  risks: CloudRisk[];
  checked: string[];
  unavailable: string[];
};

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "阿里云接口请求失败";
}

function parseAmount(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function runtimeOptions() {
  return new RuntimeOptions({ connectTimeout: 6000, readTimeout: 15000, autoretry: true, maxAttempts: 2 });
}

function accountInfo(credentials: InsightCredentials) {
  return { id: credentials.id, name: credentials.name, site: credentials.site };
}

function monthsBack(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

function createBssClient(credentials: InsightCredentials) {
  const international = credentials.site === "international";
  return new BssOpenApi(new Config({
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    endpoint: international ? "business.ap-southeast-1.aliyuncs.com" : "business.aliyuncs.com",
    regionId: international ? "ap-southeast-1" : "cn-hangzhou",
  }));
}

export async function fetchAccountResources(credentials: InsightCredentials): Promise<AccountResources> {
  try {
    const client = new ResourceCenter(new Config({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      endpoint: "resourcecenter.aliyuncs.com",
      regionId: credentials.site === "international" ? "ap-southeast-1" : "cn-hangzhou",
    }));
    const resources: CloudResource[] = [];
    let nextToken: string | undefined;
    do {
      const response = await client.searchResourcesWithOptions(
        new SearchResourcesRequest({ maxResults: 100, nextToken }),
        runtimeOptions(),
      );
      for (const item of response.body?.resources ?? []) {
        const type = item.resourceType || "ACS::Unknown::Resource";
        resources.push({
          id: item.resourceId || `${type}-${resources.length}`,
          name: item.resourceName || item.resourceId || "未命名资源",
          type,
          product: type.split("::")[1] || "Other",
          region: item.regionId || "global",
          zone: item.zoneId || "-",
          createdAt: item.createTime || "",
          expiresAt: item.expireTime || "",
          resourceGroupId: item.resourceGroupId || "默认资源组",
          ips: item.ipAddresses ?? [],
          tags: (item.tags ?? []).map((tag) => ({ key: tag.key || "-", value: tag.value || "-" })),
        });
      }
      nextToken = response.body?.nextToken;
    } while (nextToken);

    const countMap = new Map<string, number>();
    resources.forEach((resource) => countMap.set(resource.product, (countMap.get(resource.product) ?? 0) + 1));
    return {
      account: accountInfo(credentials),
      resources,
      counts: Array.from(countMap, ([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count),
    };
  } catch (error) {
    const resourceCenterError = errorMessage(error);
    try {
      const overview = await fetchAliyunOverview(credentials);
      const resources: CloudResource[] = overview.instances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        type: "ACS::ECS::Instance",
        product: "ECS",
        region: instance.region,
        zone: instance.zone,
        createdAt: "",
        expiresAt: instance.expiredAt === "-" ? "" : instance.expiredAt,
        resourceGroupId: "默认资源组",
        ips: instance.publicIp === "-" ? [] : [instance.publicIp],
        tags: [],
      }));
      return {
        account: accountInfo(credentials),
        resources,
        counts: resources.length ? [{ product: "ECS", count: resources.length }] : [],
        error: `资源中心不可用，已回退到 ECS 扫描。${resourceCenterError}`,
      };
    } catch {
      return { account: accountInfo(credentials), resources: [], counts: [], error: resourceCenterError };
    }
  }
}

export async function fetchAccountCosts(credentials: InsightCredentials): Promise<AccountCosts> {
  const client = createBssClient(credentials);
  const months = monthsBack(6);
  try {
    const responses = await Promise.all(months.map((billingCycle) => client.queryAccountBillWithOptions(
      new QueryAccountBillRequest({ billingCycle, granularity: "MONTHLY", isGroupByProduct: true, pageNum: 1, pageSize: 300 }),
      runtimeOptions(),
    )));
    const monthlyCosts: MonthlyCost[] = [];
    const productMap = new Map<string, ProductCost>();

    responses.forEach((response, index) => {
      const items = response.body?.data?.items?.item ?? [];
      const currency = items[0]?.currency || (credentials.site === "international" ? "USD" : "CNY");
      const gross = items.reduce((total, item) => total + parseAmount(item.pretaxGrossAmount), 0);
      const payable = items.reduce((total, item) => total + parseAmount(item.pretaxAmount), 0);
      monthlyCosts.push({ month: months[index], gross, payable, discount: Math.max(0, gross - payable), currency });

      if (index === responses.length - 1) {
        items.forEach((item) => {
          const product = item.productName || item.productCode || item.pipCode || "其他";
          const itemCurrency = item.currency || currency;
          const key = `${product}-${itemCurrency}`;
          const current = productMap.get(key) ?? { product, currency: itemCurrency, gross: 0, payable: 0, discount: 0 };
          current.gross += parseAmount(item.pretaxGrossAmount);
          current.payable += parseAmount(item.pretaxAmount);
          current.discount = Math.max(0, current.gross - current.payable);
          productMap.set(key, current);
        });
      }
    });

    return {
      account: accountInfo(credentials),
      months: monthlyCosts,
      products: Array.from(productMap.values()).sort((a, b) => b.gross - a.gross),
    };
  } catch (error) {
    return { account: accountInfo(credentials), months: [], products: [], error: errorMessage(error) };
  }
}

function risk(id: string, level: CloudRisk["level"], category: CloudRisk["category"], title: string, detail: string, resource?: string): CloudRisk {
  return { id, level, category, title, detail, resource };
}

export async function fetchAccountRisks(credentials: InsightCredentials): Promise<AccountRisks> {
  const risks: CloudRisk[] = [];
  const checked: string[] = [];
  const unavailable: string[] = [];
  const [overviewResult, keyResult] = await Promise.allSettled([
    fetchAliyunOverview(credentials),
    (async () => {
      const client = new Ims(new Config({
        accessKeyId: credentials.accessKeyId,
        accessKeySecret: credentials.accessKeySecret,
        endpoint: "ims.aliyuncs.com",
        regionId: credentials.site === "international" ? "ap-southeast-1" : "cn-hangzhou",
      }));
      const [keys, lastUsed] = await Promise.all([
        client.listAccessKeysWithOptions(new ListAccessKeysRequest({}), runtimeOptions()),
        client.getAccessKeyLastUsedWithOptions(new GetAccessKeyLastUsedRequest({ userAccessKeyId: credentials.accessKeyId }), runtimeOptions()),
      ]);
      return { keys: keys.body?.accessKeys?.accessKey ?? [], lastUsed: lastUsed.body?.accessKeyLastUsed };
    })(),
  ]);

  if (overviewResult.status === "fulfilled") {
    checked.push("余额与账单", "ECS 到期与运行状态", "地域可用性");
    const overview = overviewResult.value;
    if (overview.balance.available < 100) {
      risks.push(risk("low-balance", overview.balance.available <= 0 ? "critical" : "warning", "费用", "账号余额偏低", `当前可用余额为 ${overview.balance.available.toFixed(2)} ${overview.balance.currency}`));
    }
    if (overview.monthSpend > overview.balance.available && overview.monthSpend > 0) {
      risks.push(risk("spend-over-balance", "critical", "费用", "余额低于本月应付", `本月应付 ${overview.monthSpend.toFixed(2)}，可用余额 ${overview.balance.available.toFixed(2)} ${overview.balance.currency}`));
    }
    const now = Date.now();
    overview.instances.forEach((instance) => {
      const expiresAt = Date.parse(instance.expiredAt);
      const days = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - now) / 86400000) : null;
      if (days !== null && days <= 30) {
        risks.push(risk(`expire-${instance.id}`, days <= 7 ? "critical" : "warning", "资源", `${instance.name} 即将到期`, days < 0 ? `已过期 ${Math.abs(days)} 天` : `剩余 ${days} 天到期`, instance.id));
      }
      if (instance.status === "Stopped") {
        risks.push(risk(`stopped-${instance.id}`, "info", "资源", `${instance.name} 已停止`, `${instance.region} 中的实例当前处于停止状态`, instance.id));
      }
    });
    overview.regionErrors.forEach((item) => risks.push(risk(`region-${item.region}`, "warning", "可用性", `${item.region} 读取失败`, item.message, item.region)));
  } else {
    unavailable.push(`余额、账单与 ECS：${errorMessage(overviewResult.reason)}`);
  }

  if (keyResult.status === "fulfilled") {
    checked.push("AccessKey 状态与使用时间");
    const current = keyResult.value.keys.find((item) => item.accessKeyId === credentials.accessKeyId);
    if (current?.status && current.status !== "Active") {
      risks.push(risk("inactive-key", "critical", "安全", "当前 AccessKey 未启用", `AccessKey 状态为 ${current.status}`));
    }
    const createdAt = current?.createDate ? Date.parse(current.createDate) : NaN;
    if (Number.isFinite(createdAt)) {
      const age = Math.floor((Date.now() - createdAt) / 86400000);
      if (age > 180) risks.push(risk("old-key", age > 365 ? "critical" : "warning", "安全", "AccessKey 长期未轮换", `当前密钥已使用 ${age} 天，建议定期轮换`));
    }
    const lastUsedAt = keyResult.value.lastUsed?.lastUsedDate ? Date.parse(keyResult.value.lastUsed.lastUsedDate) : NaN;
    if (Number.isFinite(lastUsedAt)) {
      const idle = Math.floor((Date.now() - lastUsedAt) / 86400000);
      if (idle > 90) risks.push(risk("idle-key", "info", "安全", "AccessKey 长时间未使用", `距上次使用已有 ${idle} 天`));
    }
  } else {
    unavailable.push(`AccessKey 审计：${errorMessage(keyResult.reason)}`);
  }

  return { account: accountInfo(credentials), risks, checked, unavailable };
}
