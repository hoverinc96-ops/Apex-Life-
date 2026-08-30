"use client";

import { useCallback, useState } from "react";
import KanbanBoard from "@/components/KanbanBoard";
import ImportLeadsPanel from "@/components/ImportLeadsPanel";

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleImported = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ImportLeadsPanel onImported={handleImported} />
      <KanbanBoard refreshKey={refreshKey} />
    </div>
  );
}
