import { Link } from "react-router-dom";
import "../styles/sign-in.css";

export function PublicLinkPage() {
  return (
    <main className="link-page-root">
      <p>Program link page</p>
      <Link to="/">Practitioner app</Link>
    </main>
  );
}
