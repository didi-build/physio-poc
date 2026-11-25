import { useEffect, useMemo, useState } from "react";
import type { BodyRegionListItem } from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import {
  ALL_REGIONS_FILTER_PILL,
  buildBodyRegionFilterPills,
  type BodyRegionFilterPill,
} from "./library-filters.js";

export function useBodyRegionFilterPills(): readonly BodyRegionFilterPill[] {
  const client = useRoutinesApi();
  const sessionReady = usePractitionerSession().status === "ready";
  const [regions, setRegions] = useState<BodyRegionListItem[]>([]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    if (typeof client.listMeBodyRegions !== "function") {
      return;
    }
    let cancelled = false;
    void client
      .listMeBodyRegions()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setRegions(list);
        }
      })
      .catch(() => {
        /* unmount or network failure; All regions pill remains */
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionReady]);

  return useMemo(() => {
    if (regions.length === 0) {
      return [ALL_REGIONS_FILTER_PILL];
    }
    return buildBodyRegionFilterPills(regions);
  }, [regions]);
}
