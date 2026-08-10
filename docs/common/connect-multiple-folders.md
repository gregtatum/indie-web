---
parent: file-store-server
order: 2
---

# Connect Multiple Folders

Each server instance connects a single folder. To connect more than one — for example, `Documents` and `Music` — run another instance with its own port and folder, then add each one separately in the app.

## Docker

Add another service to your `docker-compose.yml`, with its own name, port, and folder:

```yaml
services:
  floppydisk-docs:
    image: tatumcreative/floppydisk.link:latest
    container_name: floppydisk-docs
    restart: unless-stopped
    ports:
      - "6543:6543"
    volumes:
      - /path/to/documents:/app/mount

  floppydisk-music:
    image: tatumcreative/floppydisk.link:latest
    container_name: floppydisk-music
    restart: unless-stopped
    ports:
      - "6544:6543"
    volumes:
      - /path/to/music:/app/mount
```

Then add each folder separately in the app, using the matching port.

## Node.js

Start another instance on a different port and mount path:

```shell
PORT=6544 MOUNT_PATH=/path/to/music npm start
```

See [Run Directly with Node.js](/docs/run-with-nodejs.html) for the initial setup.

[Local & Network Storage ←](/docs/file-store-server.html)
