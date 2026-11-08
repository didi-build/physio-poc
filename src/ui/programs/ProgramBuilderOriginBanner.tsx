import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ProgramRoutineOriginView } from "../../services/programs/types.js";
import {
  ORIGIN_BANNER_NOTE,
  VIEW_ROUTINE,
  builderOriginBannerTitle,
} from "../copy/programs.js";

export type ProgramBuilderOriginBannerProps = {
  origin: ProgramRoutineOriginView;
};

export function ProgramBuilderOriginBanner({
  origin,
}: ProgramBuilderOriginBannerProps) {
  return (
    <div className="pg-origin-banner" data-testid="program-builder-origin-banner">
      <p className="pg-origin-banner-title">
        {builderOriginBannerTitle(origin.routine_name, origin.routine_version_number)}
      </p>
      <p className="pg-origin-banner-note">{ORIGIN_BANNER_NOTE}</p>
      <Link
        className="ex-link-btn pg-origin-banner-link"
        to={fillPhysioAppRoutePattern("routineDetail", {
          routineId: origin.routine_id,
        })}
      >
        {VIEW_ROUTINE}
      </Link>
    </div>
  );
}
