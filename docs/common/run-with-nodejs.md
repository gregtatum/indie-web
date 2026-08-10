---
parent: file-store-server
order: 3
---

# Run with Node.js

You can run the server directly with Node.js instead of Docker. This is a good option if you already use Node.js or don't want to set up Docker.

When run this way, the server has the same access to your computer as your user account. Only run it on a computer you trust.

Clone the project and install the server:

```shell
git clone https://github.com/gregtatum/indie-web.git
cd indie-web/src/server
npm install
```

Start the server with the folder you want to connect:

```shell
MOUNT_PATH=/path/to/folder npm start
```

The server uses port `6543` by default. To use a different port:

```shell
PORT=6544 MOUNT_PATH=/path/to/folder npm start
```

To connect more than one folder, see [Connect Multiple Folders](/docs/connect-multiple-folders.html).
