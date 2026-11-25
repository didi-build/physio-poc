import { useMemo } from "react";
import type { BodyRegionListItem } from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { buildSessionReadCacheKey } from "../api/session-read-cache.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import {
  ALL_REGIONS_FILTER_PILL,
  buildBodyRegionFilterPills,
  type BodyRegionFilterPill,
} from "./library-filters.js";

export function useBodyRegionFilterPills(): readonly BodyRegionFilterPill[] {
  const client = useRoutinesApi();
  const sessionReady = usePractitionerSession().status === "ready";
  const sessionEpoch = useSessionReadCacheEpoch();

  const bodyRegionsCacheKey = useMemo(
    () =>
      sessionReady && sessionEpoch
        ? buildSessionReadCacheKey(sessionEpoch, {
            resource: "routines.body_regions",
          })
        : null,
    [sessionEpoch, sessionReady],
  );

  const { data: regionsData } = useSessionCachedRead<BodyRegionListItem[]>({
    cacheKey: bodyRegionsCacheKey,
    enabled: sessionReady,
    retainOnError: false,
    fetcher: async (signal) => {
      const list = await client.listMeBodyRegions({ signal });
      return Array.isArray(list) ? list : [];
    },
  });

  const regions = regionsData ?? [];

  return useMemo(() => {
    if (regions.length === 0) {
      return [ALL_REGIONS_FILTER_PILL];
    }
    return buildBodyRegionFilterPills(regions);
  }, [regions]);
}
