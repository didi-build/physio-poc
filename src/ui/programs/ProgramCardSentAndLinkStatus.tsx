export type ProgramCardSentAndLinkStatusProps = {
  countAndSentLine: string;
  linkStatusLine: string;
};

/** Built for DIDI-1141; not mounted until list API supplies sent/link fields (DIDI-1140). */
export function ProgramCardSentAndLinkStatus({
  countAndSentLine,
  linkStatusLine,
}: ProgramCardSentAndLinkStatusProps) {
  return (
    <>
      <p className="pg-card-count-sent">{countAndSentLine}</p>
      <p className="pg-card-link-status">{linkStatusLine}</p>
    </>
  );
}
