import type { Device } from "../device";
import { CODES, HALF } from "../types";
import { string2bytes, Config } from "../helpers";

import si from "systeminformation";
import dayjs from "dayjs";

let lastMem: number = 50;
let lastCPU: number = 50;
let lastGPU: number = 50;
let lastTimeMaster: string = "00:00";
let lastTimeSlave: string = "00:00";

const diffVal = 3;

if (process.platform == 'win32') si.powerShellStart()

/**
 * Sync system stats to the keyboard
 *
 * @async
 * @param {Device} d - The device to sync the stats to
 * @param {HALF} half - The half of the keyboard to sync the stats to
 */
export const syncSystemStats = async (d: Device, half: HALF, config: Config) => {

  const valueConfig = {
    currentLoad: 'currentLoad',
    // graphics: 'controllers',
    mem: 'active, used, free'
  } 

  let data = await si.get(valueConfig)

  // mem
  let memUsage = Math.round((data.mem.active / (data.mem.used + data.mem.free)) * 100);
  // console.log(memUsage)
  if (Math.abs(memUsage - lastMem) > diffVal) {
      d.write(CODES.RAM, half, [memUsage]);
      lastMem = memUsage;
  }
  // cpu
  let cpuUsage = Math.round(data.currentLoad.currentLoad);
  if (Math.abs(cpuUsage - lastCPU) > diffVal) {
    d.write(CODES.CPU, half, [cpuUsage]);
    lastCPU = cpuUsage;
  }
  // gpu -> this only works on NVIDIA
  // let gpuUsage = Math.round(data.graphics.controllers[0].utilizationGpu || 0);
  // if (Math.abs(gpuUsage - lastGPU) > diffVal) {
  //   d.write(CODES.GPU, half, [gpuUsage]);
  //   lastGPU = gpuUsage;
  // }
};

export const syncLargeSystemTime = async (d: Device, half: HALF, config: Config) => syncSystemTime(d, half, config, true);

export const syncSystemTime = async (d: Device, half: HALF, config: Config, l?: Boolean) => {
  let date = new Date(); // time now
  let time = dayjs(date).format(l==true ? "hh\nmm\na": "hh:mma");
  if (time !== (half == HALF.MASTER ? lastTimeMaster : lastTimeSlave )) {
    d.write(CODES.TIME, half, string2bytes(time));
    (half == HALF.MASTER ? lastTimeMaster = time : lastTimeSlave = time);
  }
};
