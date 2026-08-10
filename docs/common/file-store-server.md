---
section: File stores
order: 4
---

# Local & Network Storage

Local and network storage lets you use folders from your computer, home server, or network storage device (NAS) as a workspace. It’s a good choice if you already keep your files on your own hardware or want to work directly with existing folders.

Only the folders you choose are accessible, and you can connect multiple folders as separate workspaces.

Your files remain ordinary files, so you can open, edit, move, or back them up with other tools as usual.

Setup has two parts: run a small server on the computer or NAS where your files are stored, then connect to it from the app.


## Start the server

Docker is the recommended way to run the server, especially on a NAS or an always-on computer. It keeps the server isolated from the rest of the system and is generally the safer option.

Create a `docker-compose.yml`, or add this service to an existing one. Give the container a name that matches the folder or workspace you’ll use in the app, and change `./mount` to the folder you want to connect.

```yaml
services:
  floppydisk:
    image: tatumcreative/floppydisk.link:latest
    container_name: floppydisk
    restart: unless-stopped

    ports:
      # Change the first number if you want it on a different port.
      - "6543:6543"

    volumes:
      # Change "/path/to/documents" to the folder you want to connect.
      - /path/to/documents:/app/mount
```

Start it with:

```shell
docker compose up --detach
```

Stop it with:

```shell
docker compose down
```

## Connect the folder

Once the server is running, go to [Connect a Folder](http://localhost:2345/connect-folder) and enter:

- **Name** — a name for the folder, such as `Documents` or `Music`.
- **Server Address** — the address of the computer or NAS running the server. Use <span style='white-space: nowrap'>`http://localhost:6543`</span> if it’s running on this computer, or an address like <span style='white-space: nowrap'>`http://servername.local:6543`</span> if it’s running on a NAS or another computer on your network.

## What's next

See the [File Server reference](/docs/file-server.html) for running the server with Node.js instead of Docker, connecting multiple folders, accessing your files remotely, and how access is secured.

[Connect local or network storage →](/connect-folder)
