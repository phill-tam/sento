import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { RomajiProvider } from "./context/RomajiContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./styles/global.css";

// Theme and romaji are both cross-cutting display preferences read from
// the leaves (cards, SettingsPanel), so they sit here rather than adding
// nesting levels to App.jsx's return — which is what SoundProviders
// exists to avoid for the two sound contexts.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <RomajiProvider>
        <App />
      </RomajiProvider>
    </ThemeProvider>
  </StrictMode>
);