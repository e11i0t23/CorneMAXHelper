import { app, Tray, Menu, nativeImage, BrowserWindow, shell, protocol, session, dialog } from 'electron'
import HID, { HIDAsync } from 'node-hid'
import {usb, WebUSB} from 'usb'
import si from 'systeminformation';
import dayjs from 'dayjs'
// const { SpotifyApi } = require('@spotify/web-api-ts-sdk');
import { convertImageBlob } from "./converter";
import { ImageMode, OutputMode, CODES, HALF, ConfigStore } from './types';
import { loadImage } from '@napi-rs/canvas';
import path from "path"
import {readFileSync} from "fs"
import {Config, string2bytes} from "./helpers"
import { uploadImage } from './uploadImage';

import {spotifyAuth, getUserPlayback} from './modules/spotify'


const userDataPath = app.getPath("userData")

let config: Config
let tray: Tray
let intervalIDSync: any
let intervalIDSpotify: any
let hiddev: HIDAsync
let connected = false

const webusb = new WebUSB({
    allowAllDevices: true
});

const connectSpotify = () => {
    console.log('Connecting to Spotify')
    // const sdk = SpotifyApi.performUserAuthorization(client_id, "http://localhost.com:3961/spotify-callback", ["user-read-playback-state"], (accesstoken) => {
    //     console.log(accesstoken)
    // });
    spotifyAuth(config)
}

if (require('electron-squirrel-startup')) {
    console.log("quitting")
    app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const contextMenu = () => Menu.buildFromTemplate(connected ? [
    { label: "Connected"  },
    // { label: 'Link Spotify', click: connectSpotify },
    { label: 'Upload Master', click: () => uploadCustomImage(HALF.MASTER) },
    { label: 'Upload Slave', click: () => uploadCustomImage(HALF.SLAVE) },
    { label: 'Quit', click: app.quit }
]: [
    { label: "Disconnected" },
    { label: 'Quit', click: app.quit }
])

app.on("ready", async () => {
    config = new Config(userDataPath)
    // const partition = 'persist:electron'
    // const ses = session.fromPartition(partition)
    // console.log(path.join(path.dirname(), "logo.png"))
    const icon = nativeImage.createFromPath( path.join(__dirname, "./images/logoTemplate.png"))
    tray = new Tray(icon)
    tray.setToolTip('Mechboards Max Helper')
    tray.setContextMenu(contextMenu())
    console.log('Tray created')

    // ses.protocol.handle('mechboards', (request) => {
    //     console.log(request.url)
    //     const filePath = request.url.slice('mechboards://'.length)
    //     return
    // })

    connectToDevice()
})

const connectToDevice = async () => {

    // See if the keyboard is already connected to the PC, if it is connect to the HID device otherwise watch for its connection
    var devices = await HID.devicesAsync();
    // console.log(devices.filter(device => device.vendorId == 18003))
    var device = devices.find(device => device.vendorId == 0x4653 && device.productId == 0x0001 && device.usagePage == 0xFF60 && device.usage == 0x61);
    // device = devices.find(device => device.vendorId == 18003 && device.productId == 1 && device.usagePage == 65376 && device.usage == 116);
    if (!device) return false
    try {
        if (!device.path) throw("not string")
        hiddev = await HID.HIDAsync.open(device.path);
        // console.log(hiddev.getDeviceInfo())
        if (!hiddev) return false
        connected = true;
        console.log('Connected to device')
        intervalIDSync = setInterval(sync, 5000)
        intervalIDSpotify = setInterval(getUserPlayback, 10000, config, hiddev)
        // getUserPlayback()
        tray.setContextMenu(contextMenu())
        return true

    } catch (error) {
        console.error(error)
        setTimeout(connectToDevice, 1000)
    }

}

// webusb.addEventListener('connect', async (device) => {
//     device = device.device
//     if (connected) return
//     if (!(device.vendorId == Number(0x4653) && device.productId == Number(0x0001))) return
//     console.log('Keyboard attached, connecting to device')
//     connectToDevice()

// });

usb.on("attach", async (device) => {

    if (connected) return
    if (!(device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001))) return
    console.log('Keyboard attached, connecting to device')
    connectToDevice()
})

usb.on('detach', (device) => {
    console.log("something disconnected")
    if (device.deviceDescriptor.idVendor == Number(0x4653) && device.deviceDescriptor.idProduct == Number(0x0001)) {
        connected = false;
        hiddev.close()
        hiddev;
        tray.setContextMenu(contextMenu())
        console.log("Discconected device")
        try {
            clearInterval(intervalIDSync)
            clearInterval(intervalIDSpotify)
        } catch (error) { }

    }
});
// webusb.addEventListener('disconnect', (device) => {
//     console.log("something disconnected")
//     device = device.device
//     if (device.vendorId == Number(0x4653) && device.productId == Number(0x0001)) {
//         connected = false;
//         hiddev.close()
//         hiddev = null;
//         tray.setContextMenu(contextMenu())
//         console.log("Discconected device")
//         try {
//             clearInterval(intervalIDSync)
//             clearInterval(intervalIDSpotify)
//         } catch (error) { }

//     }
// });


const sync = async () => {
    var half = HALF.MASTER
    // mem
    let mem = await si.mem()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.RAM, half, Math.round(mem.active / (mem.used + mem.free) * 100)]) as Buffer)
    // cpu
    let cpu = await si.currentLoad()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.CPU, half, (Math.round(cpu.currentLoad) )])as Buffer)
    // // gpu
    let gpu = await si.graphics()
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.GPU, half, (Math.round(gpu.controllers[0].utilizationGpu || 0) )])as Buffer)
    // time
    let d = new Date(); // for now
    hiddev.write(new Uint8Array([0xFF, 0x07, 0x00, CODES.TIME, half, ...string2bytes(`${dayjs(d).format("hh:mm")}`)])as Buffer)
    // hiddev.write([0xFF, CODES.TIME, ...string2bytes(`${dayjs(d).format("hh:mm")}`)])
}

const uploadCustomImage = async (half: number) => {
    const OF = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
    if (OF.canceled) return
    if (OF.filePaths.length == 0) return
    const image = await loadImage(OF.filePaths[0])
    uploadImage(hiddev, CODES.IMG_FULLSIZE, half, image, 80, 160)
}