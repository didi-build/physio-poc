import { linkPageDoseLines } from "../../domain/link-page-dose.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";

function DosePhrase({ phrase }: { phrase: string }) {
  const wholeBold = /^(every day|once a day|twice a day)$/i.test(phrase.trim());
  if (wholeBold) {
    return <span className="link-page-dose-strong">{phrase}</span>;
  }
  const match = phrase.match(/^(\d+(?:\.\d+)?s?|\d+x|\d+)(.*)$/);
  if (!match) {
    return <span>{phrase}</span>;
  }
  return (
    <>
      <span className="link-page-dose-strong">{match[1]}</span>
      {match[2]}
    </>
  );
}

export function LinkPageDoseBlock({ params }: { params: ExerciseParams }) {
  const lines = linkPageDoseLines(params);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="link-page-dose">
      {lines.map((phrases, lineIndex) => (
        <p key={lineIndex} className="link-page-dose-line">
          {phrases.map((phrase, phraseIndex) => (
            <span key={phraseIndex}>
              {phraseIndex > 0 ? ", " : null}
              <DosePhrase phrase={phrase} />
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
