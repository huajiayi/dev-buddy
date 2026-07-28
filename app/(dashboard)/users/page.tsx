"use client";

import AdminDashboard from "@/app/admin-dashboard";
import { UiDataState, useUiData } from "@/app/ui-data";
import type { AppUser } from "@/lib/auth";
import type { DatabaseGrant, ServerGrant } from "@/lib/authorization";
import type { ManagedDatabase } from "@/lib/database-management";
import type { ManagedServer } from "@/lib/server-management";

type UsersPageData = {
  users: AppUser[];
  currentUserId: string;
  servers: ManagedServer[];
  databases: ManagedDatabase[];
  serverGrants: ServerGrant[];
  databaseGrants: DatabaseGrant[];
  defaultPasswordConfigured: boolean;
};

export default function UsersPage() {
  const state = useUiData<UsersPageData>("users");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <AdminDashboard
      users={data.users}
      currentUserId={data.currentUserId}
      servers={data.servers}
      databases={data.databases}
      serverGrants={data.serverGrants}
      databaseGrants={data.databaseGrants}
      hasDefaultUserPassword={data.defaultPasswordConfigured}
    />}
  </UiDataState>;
}
