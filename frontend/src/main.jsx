import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/shippori-mincho/500.css";
import "@fontsource/shippori-mincho/600.css";
import "@fontsource/shippori-mincho/800.css";
import "./styles/index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      gutter={10}
      toastOptions={{
        duration: 2800,
        style: {
          background: "rgba(16, 20, 31, 0.94)",
          color: "#ece9e2",
          border: "1px solid rgba(228, 87, 58, 0.35)",
          borderRadius: "10px",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(12px)",
          fontFamily: '"Zen Kaku Gothic New", sans-serif',
          fontSize: "0.88rem",
          padding: "10px 14px"
        },
        success: {
          iconTheme: { primary: "#e4573a", secondary: "#fff7ef" }
        },
        error: {
          iconTheme: { primary: "#ff7a5c", secondary: "#0b0e17" }
        }
      }}
    />
  </StrictMode>
);
