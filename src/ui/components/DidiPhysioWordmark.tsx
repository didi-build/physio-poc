import "../styles/sign-in.css";

export function DidiPhysioWordmark() {
  return (
    <div className="sign-in-wordmark">
      <span className="sign-in-wordmark-tile" aria-hidden="true">
        D
      </span>
      <span className="sign-in-wordmark-text">
        <span className="sign-in-wordmark-didi">Didi</span>{" "}
        <span className="sign-in-wordmark-physio">Physio</span>
      </span>
    </div>
  );
}
