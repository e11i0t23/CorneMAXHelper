import type { ForgeConfig } from '@electron-forge/shared-types';
import { FusesPlugin }  from '@electron-forge/plugin-fuses';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import path from 'path'

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './images/icon.png',
    extraResource: [
      path.join(__dirname, './images/icon.png'), 
      path.join(__dirname, './images/icon.ico'),
      path.join(__dirname, './images/icon.icns'),
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        iconUrl: 'https://mechboards.co.uk/cdn/shop/files/Artboard_2_copy_2_3x_b4ac734d-1aed-4cec-96cc-2263b710dcba_680x.png',
        // The ICO file to use as the icon for the generated Setup.exe
        setupIcon: './images/icon.ico'
      },
      platforms: ['win32']
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './images/icon.png'
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: {},
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: '',
          },
        ],
      },
    }),
    {
      name:'@timfish/forge-externals-plugin',
      config:{
        externals: ['node-hid', 'usb'],
        includeDeps: true
      }
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
