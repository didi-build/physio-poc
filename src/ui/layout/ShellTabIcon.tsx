export type ShellTabIconProps = {
  pathD: string;
  active: boolean;
};

/** 22 px icons; stroke 1.8 inactive and 2.1 active (approved v12 mock tab bar). */
export function ShellTabIcon({ pathD, active }: ShellTabIconProps) {
  return (
    <svg
      className="shell-tab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.1 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={pathD} />
    </svg>
  );
}
