---
parent: file-store-server
order: 2
---

# Connect Multiple Folders

Each server connects a single folder. To connect more than one folder, such as `Documents` and `Music`, run a separate server for each folder using a different port. Then add each folder separately in the app.

## Docker

Add another service to your `docker-compose.yml` with its own name, port, and folder:

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

Then add each folder separately in the app using its matching port.

## Node.js

Start another server with a different port and folder:

```shell
PORT=6544 MOUNT_PATH=/path/to/music npm start
```

See [Run Directly with Node.js](/docs/run-with-nodejs.html) for the initial setup.
