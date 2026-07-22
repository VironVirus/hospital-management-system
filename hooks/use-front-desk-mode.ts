"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "st-gianna-front-desk-mode";
const EVENT_NAME = "st-gianna-front-desk-mode-change";

function readFrontDeskMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function useFrontDeskMode() {
  const [frontDeskMode, setFrontDeskModeState] = useState(false);

  useEffect(() => {
    setFrontDeskModeState(readFrontDeskMode());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncState = () => {
      setFrontDeskModeState(readFrontDeskMode());
    };

    window.addEventListener("storage", syncState);
    window.addEventListener(EVENT_NAME, syncState);

    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(EVENT_NAME, syncState);
    };
  }, []);

  const setFrontDeskMode = (value: boolean) => {
    setFrontDeskModeState(value);

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    window.dispatchEvent(new Event(EVENT_NAME));
  };

  return {
    frontDeskMode,
    setFrontDeskMode,
    toggleFrontDeskMode: () => setFrontDeskMode(!frontDeskMode)
  };
}
