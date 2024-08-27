# Mechboards Max Display Drive

A tray application built on electron for sending data to the displays on the Mechboards CRKBD Max

## Development

1. Fork this repo
2. Clone your fork
3. Install the dependencies 
    ```
    npm install
    ```
4. Start the Application 
   ```
   npm run start
   ```

## Adding a new module

Modules can be added under `./src/modules` exporting a sync command that can be imported under `./src/index.ts` and enabled by updating the `new Device` args. Each command needs a new enum value added to `CODES` in `./src/types.ts` **AND** to the enum `display_data_type` in the keyboards `display.h` which is used to uniquely identify the command.

The sync command exported must take a `Device` as the first argument which can be written to with `.write(command, half, data)` where `command` is the corresponding value from `CODES`, `half` is the keyboard half to write to, and `data` is data you want sending to the keyboard.