import { getUserPlayback } from "./modules/spotify";
import { syncSystemStats, syncSystemTime, syncLargeSystemTime } from "./modules/systemStats";
import { ScreenSync } from "./types";

export const screens: ScreenSync[] = [
  {
    id: 0,
    name: "Stats Basic",
    code: 0x00,
    modules: [],
    frequency: 1000,
  },
  {
    id: 1,
    name: "Stats",
    code: 0x01,
    modules: [syncSystemStats],
    frequency: 2000,
  },
  {
    id: 2,
    name: "Time",
    code: 0x02,
    modules: [syncLargeSystemTime],
    frequency: 2000,
  },
  {
    id: 3,
    name: "Now Playing",
    code: 0x03,
    modules: [getUserPlayback, syncSystemTime],
    frequency: 2000,
  },
  {
    id: 4,
    name: "Gif",
    code: 0x04,
    modules: [],
    frequency: 2000,
  },
];
