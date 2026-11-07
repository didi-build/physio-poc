import { useState } from "react";
import {
  ALL_ROUTINES_EMPTY_HEADING,
  ALL_ROUTINES_EMPTY_HELPER,
  MY_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_EMPTY_HELPER,
  MY_ROUTINES_INTRO,
  ROUTINES_PAGE_TITLE,
  ROUTINES_TAB_ALL,
  ROUTINES_TAB_MY,
  allRoutinesIntro,
} from "../copy/routines.js";

export type RoutinesTab = "mine" | "all";

export type RoutinesListItem = {
  readonly routine_id: string;
  readonly name: string;
};

export type RoutinesPageContentProps = {
  readonly tab: RoutinesTab;
  readonly onTabChange: (tab: RoutinesTab) => void;
  readonly items: readonly RoutinesListItem[];
};

export function RoutinesPageContent({
  tab,
  onTabChange,
  items,
}: RoutinesPageContentProps) {
  const intro = tab === "mine" ? MY_ROUTINES_INTRO : allRoutinesIntro(items.length);
  const showEmpty = items.length === 0;
  const emptyHeading =
    tab === "mine" ? MY_ROUTINES_EMPTY_HEADING : ALL_ROUTINES_EMPTY_HEADING;
  const emptyHelper =
    tab === "mine" ? MY_ROUTINES_EMPTY_HELPER : ALL_ROUTINES_EMPTY_HELPER;

  return (
    <section
      className="pg-page ex-page"
      aria-labelledby="routines-heading"
      data-testid="routines-page"
    >
      <header className="pg-page-header">
        <h1 id="routines-heading" className="ex-page-title">
          {ROUTINES_PAGE_TITLE}
        </h1>
      </header>

      <div className="ex-tabs" role="tablist" aria-label={ROUTINES_PAGE_TITLE}>
        <button
          type="button"
          role="tab"
          id="routines-tab-mine"
          aria-selected={tab === "mine"}
          aria-controls="routines-tabpanel"
          className={`ex-tab${tab === "mine" ? " ex-tab--active" : ""}`}
          onClick={() => {
            onTabChange("mine");
          }}
        >
          {ROUTINES_TAB_MY}
        </button>
        <button
          type="button"
          role="tab"
          id="routines-tab-all"
          aria-selected={tab === "all"}
          aria-controls="routines-tabpanel"
          className={`ex-tab${tab === "all" ? " ex-tab--active" : ""}`}
          onClick={() => {
            onTabChange("all");
          }}
        >
          {ROUTINES_TAB_ALL}
        </button>
      </div>

      <p className="ex-page-intro">{intro}</p>

      <div
        id="routines-tabpanel"
        role="tabpanel"
        aria-labelledby={tab === "mine" ? "routines-tab-mine" : "routines-tab-all"}
      >
        {showEmpty ? (
          <div className="pg-empty" data-testid="routines-empty">
            <h2 className="pg-empty-title">{emptyHeading}</h2>
            <p className="pg-empty-helper">{emptyHelper}</p>
          </div>
        ) : (
          <ul className="pg-card-list" data-testid="routines-list">
            {items.map((item) => (
              <li key={item.routine_id} className="rt-list-row">
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function RoutinesPage() {
  const [tab, setTab] = useState<RoutinesTab>("all");
  return <RoutinesPageContent tab={tab} onTabChange={setTab} items={[]} />;
}
