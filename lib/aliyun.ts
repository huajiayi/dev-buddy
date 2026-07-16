import BssOpenApi, { QueryAccountBillRequest } from "@alicloud/bssopenapi20171214";
import Ecs, { DescribeInstancesRequest, DescribeRegionsRequest } from "@alicloud/ecs20140526";
import { Config } from "@alicloud/openapi-client";
import { RuntimeOptions } from "@alicloud/tea-util";

type Credentials = {
  accessKeyId: string;
  accessKeySecret: string;
  site: "china" | "international";
};
type EcsRegion = { id: string; name: string; endpoint: string };

export type EcsInstanceSummary = {
  id: string;
  name: string;
  region: string;
  zone: string;
  status: string;
  instanceType: string;
  cpu: number;
  memoryMb: number;
  chargeType: string;
  publicIp: string;
  expiredAt: string;
};

export type AliyunOverview = {
  balance: { available: number; cash: number; credit: number; currency: string };
  monthSpend: number;
  monthGrossSpend: number;
  billingCycle: string;
  productBills: { product: string; amount: number; grossAmount: number; currency: string }[];
  regions: EcsRegion[];
  ecs: { total: number; running: number; stopped: number; vcpus: number; memoryGb: number };
  instances: EcsInstanceSummary[];
  regionErrors: { region: string; message: string }[];
};

function parseAmount(value: string | number | null | undefined) {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value ?? "0").replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "阿里云接口请求失败";
}

async function settle<T>(promise: Promise<T>): Promise<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }> {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

function createEcsRuntimeOptions() {
  return new RuntimeOptions({
    connectTimeout: 6000,
    readTimeout: 12000,
    autoretry: true,
    maxAttempts: 2,
    backoffPolicy: "fixed",
    backoffPeriod: 800,
    keepAlive: true,
  });
}

async function discoverEcsRegions(credentials: Credentials): Promise<EcsRegion[]> {
  const isInternational = credentials.site === "international";
  const client = new Ecs(
    new Config({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      endpoint: isInternational ? "ecs.ap-southeast-1.aliyuncs.com" : "ecs.aliyuncs.com",
      regionId: isInternational ? "ap-southeast-1" : "cn-hangzhou",
    }),
  );
  const response = await client.describeRegionsWithOptions(
    new DescribeRegionsRequest({ acceptLanguage: "zh-CN", resourceType: "instance" }),
    createEcsRuntimeOptions(),
  );
  return (response.body?.regions?.region ?? [])
    .filter((region) => Boolean(region.regionId))
    .map((region) => ({
      id: region.regionId!,
      name: region.localName || region.regionId!,
      endpoint: region.regionEndpoint || `ecs.${region.regionId}.aliyuncs.com`,
    }));
}

async function queryEcsRegion(credentials: Credentials, region: EcsRegion) {
  const client = new Ecs(
    new Config({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      endpoint: region.endpoint,
      regionId: region.id,
    }),
  );
  const instances: EcsInstanceSummary[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.describeInstancesWithOptions(
      new DescribeInstancesRequest({ regionId: region.id, maxResults: 100, nextToken }),
      createEcsRuntimeOptions(),
    );
    const items = response.body?.instances?.instance ?? [];
    instances.push(
      ...items.map((item) => ({
        id: item.instanceId ?? "-",
        name: item.instanceName || item.instanceId || "未命名实例",
        region: region.id,
        zone: item.zoneId ?? "-",
        status: item.status ?? "Unknown",
        instanceType: item.instanceType ?? "-",
        cpu: item.cpu ?? 0,
        memoryMb: item.memory ?? 0,
        chargeType: item.instanceChargeType ?? "-",
        publicIp: item.publicIpAddress?.ipAddress?.[0] || item.eipAddress?.ipAddress || "-",
        expiredAt: item.expiredTime ?? "-",
      })),
    );
    nextToken = response.body?.nextToken;
  } while (nextToken);

  return instances;
}

async function queryAllEcsRegions(credentials: Credentials, regions: EcsRegion[]) {
  const results: Awaited<ReturnType<typeof settle<EcsInstanceSummary[]>>>[] = [];
  const concurrency = 6;
  for (let index = 0; index < regions.length; index += concurrency) {
    const batch = regions.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map((region) => settle(queryEcsRegion(credentials, region)))));
  }
  return results;
}

export async function fetchAliyunOverview(credentials: Credentials): Promise<AliyunOverview> {
  const bssClient = new BssOpenApi(
    new Config({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      endpoint: credentials.site === "international"
        ? "business.ap-southeast-1.aliyuncs.com"
        : "business.aliyuncs.com",
      regionId: credentials.site === "international" ? "ap-southeast-1" : "cn-hangzhou",
    }),
  );
  const billingCycle = new Date().toISOString().slice(0, 7);

  const [balanceResponse, billResponse, regionsResponse] = await Promise.all([
    settle(bssClient.queryAccountBalance()),
    settle(bssClient.queryAccountBill(
      new QueryAccountBillRequest({
        billingCycle,
        granularity: "MONTHLY",
        isGroupByProduct: true,
        pageNum: 1,
        pageSize: 300,
      }),
    )),
    settle(discoverEcsRegions(credentials)),
  ]);

  if (balanceResponse.status === "rejected") throw new Error(`余额查询失败：${errorMessage(balanceResponse.reason)}`);
  const balanceData = balanceResponse.value.body?.data;
  const billItems = billResponse.status === "fulfilled" ? billResponse.value.body?.data?.items?.item ?? [] : [];
  const rawProductBills = billItems.map((item) => ({
    product: item.productName || item.productCode || item.pipCode || "其他",
    amount: parseAmount(item.pretaxAmount),
    grossAmount: parseAmount(item.pretaxGrossAmount),
    currency: item.currency || balanceData?.currency || "CNY",
  }));
  const groupedBills = new Map<string, AliyunOverview["productBills"][number]>();
  rawProductBills.forEach((item) => {
    const key = `${item.product}-${item.currency}`;
    const current = groupedBills.get(key) ?? { ...item, amount: 0, grossAmount: 0 };
    current.amount += item.amount;
    current.grossAmount += item.grossAmount;
    groupedBills.set(key, current);
  });
  const productBills = Array.from(groupedBills.values());

  const instances: EcsInstanceSummary[] = [];
  const regionErrors: { region: string; message: string }[] = [];
  const regions = regionsResponse.status === "fulfilled" ? regionsResponse.value : [];
  if (regionsResponse.status === "rejected") {
    regionErrors.push({ region: "地域发现", message: errorMessage(regionsResponse.reason) });
  }
  const regionResults = await queryAllEcsRegions(credentials, regions);
  regionResults.forEach((result, index) => {
    if (result.status === "fulfilled") instances.push(...result.value);
    else regionErrors.push({ region: regions[index]?.id || "未知地域", message: errorMessage(result.reason) });
  });

  return {
    balance: {
      available: parseAmount(balanceData?.availableAmount),
      cash: parseAmount(balanceData?.availableCashAmount),
      credit: parseAmount(balanceData?.creditAmount),
      currency: balanceData?.currency ?? "CNY",
    },
    monthSpend: productBills.reduce((total, item) => total + item.amount, 0),
    monthGrossSpend: productBills.reduce((total, item) => total + item.grossAmount, 0),
    billingCycle,
    productBills: productBills.sort((a, b) => b.grossAmount - a.grossAmount),
    regions,
    ecs: {
      total: instances.length,
      running: instances.filter((item) => item.status === "Running").length,
      stopped: instances.filter((item) => item.status === "Stopped").length,
      vcpus: instances.reduce((total, item) => total + item.cpu, 0),
      memoryGb: instances.reduce((total, item) => total + item.memoryMb, 0) / 1024,
    },
    instances,
    regionErrors,
  };
}
