import { useEffect, useState } from "react";
import type { Display } from "../model/types";

export function useDisplays() {
  const [displays, setDisplays] = useState<Display[]>([]);
  useEffect(() => {
    const load = () => void chrome.system.display.getInfo().then(setDisplays);
    load();
    chrome.system.display.onDisplayChanged.addListener(load);
    return () => chrome.system.display.onDisplayChanged.removeListener(load);
  }, []);
  return displays;
}
