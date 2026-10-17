import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
