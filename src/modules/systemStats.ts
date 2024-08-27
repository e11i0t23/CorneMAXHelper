import type { Device } from "../device";
import { CODES, HALF } from "../types"
import { string2bytes } from "../helpers";

import si from 'systeminformation';
import dayjs from 'dayjs'

export const syncSystemStats = async (d: Device, half: HALF) => {
    // mem
    let mem = await si.mem()
    d.write(CODES.RAM, half, [Math.round(mem.active / (mem.used + mem.free) * 100)])
    // cpu
    let cpu = await si.currentLoad()
    d.write(CODES.CPU, half, [Math.round(cpu.currentLoad)])
    // // gpu
    let gpu = await si.graphics()
    d.write(CODES.GPU, half, [Math.round(gpu.controllers[0].utilizationGpu || 0)])
    // time
    let data = new Date(); // for now
    d.write(CODES.TIME, half, string2bytes(`${dayjs(data).format("hh:mm")}`))

}