export type ProgramCardSentAndLinkStatusProps = {
  countAndSentLine: string;
  linkStatusLine: string | null;
};

export function ProgramCardSentAndLinkStatus({
  countAndSentLine,
  linkStatusLine,
}: ProgramCardSentAndLinkStatusProps) {
  return (
    <>
      <p className="pg-card-count-sent">{countAndSentLine}</p>
      {linkStatusLine ? <p className="pg-card-link-status">{linkStatusLine}</p> : null}
    </>
  );
}
