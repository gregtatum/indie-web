---
parent: file-store-server
order: 3
---

# Run Directly with Node.js

You can also run the server directly with Node.js. This is simpler if you already use Node.js or don't want to set up Docker, but the server will have the same access to your computer as your user account.

Clone the project and install the server:

```shell
git clone https://github.com/gregtatum/indie-web.git
cd indie-web/src/server
npm install
```

Then start the server with the folder you want to connect:

```shell
MOUNT_PATH=/path/to/folder npm start
```

The server uses port `6543` by default. To use a different port, set `PORT` when starting it:

```shell
PORT=6544 MOUNT_PATH=/path/to/folder npm start
```

To connect more than one folder, see [Connect Multiple Folders](/docs/connect-multiple-folders.html).

[Local & Network Storage ←](/docs/file-store-server.html)
