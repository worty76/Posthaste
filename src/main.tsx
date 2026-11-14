import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureWindow } from "./capture/CaptureWindow";
import { api, toAppError } from "./lib/ipc";
import { MainWindow } from "./main/MainWindow";
import { TodayWindow } from "./today/TodayWindow";
import type { AppInfo } from "./lib/types";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/capture.css";
import "./styles/today.css";
import "./styles/main.css";

function Fatal({ message }: { message: string }) {
  return (
    <div className="fatal" role="alert">
      <h1 className="fatal__title">Posthaste can't open its database</h1>
      <p className="fatal__text">{message}</p>
      <p className="fatal__text">
        Nothing has been deleted. Your notes file was left exactly as it was. Fix the problem above
        (for example free some disk space, or check the file's permissions), then start Posthaste
        again.
      </p>
    </div>
  );
}

// All three windows load this bundle; the window's label decides which UI it is.
const label = getCurrentWindow().label;
const isCapture = label === "capture";
const isToday = label === "today";
if (isCapture) document.documentElement.classList.add("is-capture");
if (isToday) document.documentElement.classList.add("is-today");

const root = createRoot(document.getElementById("root")!);

function fallbackOs(): AppInfo["os"] {
  const ua = navigator.userAgent;
  return ua.includes("Mac") ? "macos" : ua.includes("Windows") ? "windows" : "linux";
}

api.appInfo().then(
  (info) => {
    root.render(
      <StrictMode>
        {isCapture ? (
          <CaptureWindow os={info.os} />
        ) : isToday ? (
          <TodayWindow os={info.os} />
        ) : info.startup_error ? (
          <Fatal message={info.startup_error.message} />
        ) : (
          <MainWindow info={info} />
        )}
      </StrictMode>,
    );
  },
  (e) => {
    root.render(
      isCapture ? (
        <CaptureWindow os={fallbackOs()} />
      ) : isToday ? (
        <TodayWindow os={fallbackOs()} />
      ) : (
        <Fatal message={toAppError(e).message} />
      ),
    );
  },
);
