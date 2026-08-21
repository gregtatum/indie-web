---
parent: file-store-server
order: 5
---

# Update with Node.js

If you're running the server with Node.js, update it by pulling the latest code and reinstalling dependencies.

```shell
cd indie-web
git pull
cd src/server
npm install
```

Restart the server the same way you started it:

```shell
MOUNT_PATH=/path/to/folder npm start
```

If you're running the server with Docker instead, see [Update with Docker](/docs/update-docker.html).
