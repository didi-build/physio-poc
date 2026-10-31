import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PhysioApp } from "./App.js";
import "./styles/exercise-library.css";
import "./styles/my-defaults.css";
import "./styles/shell.css";
import "./styles/sign-in.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <PhysioApp />
    </BrowserRouter>
  </StrictMode>,
);
