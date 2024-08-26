import { app, Tray, Menu, nativeImage, dialog } from 'electron'
import { loadImage } from '@napi-rs/canvas';
import path from "path"


import { Config } from "./helpers"
import { Device } from './device';

import { CODES, HALF } from './types';

import { uploadImage } from './uploadImage';

import { spotifyAuth, getUserPlayback } from './modules/spotify'
import { syncSystemStats } from './modules/systemStats'


const userDataPath = app.getPath("userData")

let config: Config
let tray: Tray
let device: Device

if (require('electron-squirrel-startup')) {
    console.log("quitting")
    app.quit()
}

if (!app.requestSingleInstanceLock()) {
    app.quit()
}

const contextMenu = (connected: boolean) => Menu.buildFromTemplate(connected ? [
    { label: "Connected" },
    // { label: 'Link Spotify', click: connectSpotify },
    { label: 'Upload Master', click: () => uploadCustomImage(HALF.MASTER) },
    { label: 'Upload Slave', click: () => uploadCustomImage(HALF.SLAVE) },
    { label: 'Quit', click: app.quit }
] : [
    { label: "Disconnected" },
    { label: 'Quit', click: app.quit }
])

app.on("ready", async () => {
    config = new Config(userDataPath)
    // const partition = 'persist:electron'
    // const ses = session.fromPartition(partition)
    // console.log(path.join(path.dirname(), "logo.png"))
    const icon = nativeImage.createFromPath(path.join(__dirname, "./images/logoTemplate.png"))
    tray = new Tray(icon)
    tray.setToolTip('Mechboards Max Helper')
    tray.setContextMenu(contextMenu(false))
    console.log('Tray created')

    // device sends self as first arg automatically to all modules
    device = new Device([{ f: getUserPlayback, freq: 5000, args: [config] }, { f: syncSystemStats, freq: 5000, args: [HALF.MASTER] }])
    device.on("connected", () => {
        tray.setContextMenu(contextMenu(true))
    })
    device.on("disconnected", () => {
        tray.setContextMenu(contextMenu(false))
    })



    // ses.protocol.handle('mechboards', (request) => {
    //     console.log(request.url)
    //     const filePath = request.url.slice('mechboards://'.length)
    //     return
    // })
})

const connectSpotify = () => {
    console.log('Connecting to Spotify')
    spotifyAuth(config)
}

const uploadCustomImage = async (half: number) => {
    const OF = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] })
    if (OF.canceled) return
    if (OF.filePaths.length == 0) return
    const image = await loadImage(OF.filePaths[0])
    uploadImage(device, CODES.IMG_FULLSIZE, half, image, 80, 160)
}