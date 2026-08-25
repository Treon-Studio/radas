import React from "react";
import ReactDOM from "react-dom/client";
import { RadasPet } from "./pet/RadasPet";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RadasPet />
  </React.StrictMode>
);
