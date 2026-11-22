import {
  TYPE_MISMATCH_BANNER_ONE,
  TYPE_MISMATCH_SHOW_ME,
  typeMismatchBannerMany,
  typeMismatchShowMeAriaLabel,
} from "../copy/program-type-mismatch.js";

export type TypeMismatchBuilderBannerProps = {
  count: number;
  onShowMe: () => void;
};

function BannerAlertIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

export function TypeMismatchBuilderBanner({
  count,
  onShowMe,
}: TypeMismatchBuilderBannerProps) {
  const heading =
    count === 1 ? TYPE_MISMATCH_BANNER_ONE : typeMismatchBannerMany(count);
  return (
    <div className="pg-type-mismatch-banner" role="status">
      <span className="pg-type-mismatch-banner-icon" aria-hidden>
        <BannerAlertIcon />
      </span>
      <p className="pg-type-mismatch-banner-heading">{heading}</p>
      <button
        type="button"
        className="pg-link-btn pg-type-mismatch-banner-action"
        aria-label={typeMismatchShowMeAriaLabel()}
        onClick={onShowMe}
      >
        {TYPE_MISMATCH_SHOW_ME}
      </button>
    </div>
  );
}
