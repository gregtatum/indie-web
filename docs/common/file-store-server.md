---
section: File stores
order: 4
---

# Local & Network Storage

Local and network storage lets you use folders from your computer, home server, or network storage device (NAS) as a workspace. It’s a good choice if you already keep your files on your own hardware or want to work directly with existing folders.

You choose which folders to make available, and you can connect multiple folders as separate workspaces.

Your files remain ordinary files, so you can open, edit, move, or back them up with other tools as usual.

Setup has two parts: run a small server on the computer or NAS where your files are stored, then connect to it from the app.


## Start the server

Docker is the recommended way to run the server, especially on a NAS or an always-on computer. It keeps the server isolated from the rest of the system and is generally the safer option.

Some NAS devices (for example, Synology's [Container Manager](https://kb.synology.com/en-us/DSM/help/ContainerManager/docker_desc)) support Docker directly through their admin UI, so you can run the same image there without a separate machine.

Create a `docker-compose.yml`, or add this service to an existing one. Give the container a name that matches the folder or workspace you’ll use in the app, and change `/path/to/documents` to the folder you want to connect.

```yaml
services:
  floppydisk:
    image: tatumcreative/floppydisk.link:latest
    container_name: floppydisk-docs
    hostname: floppydisk
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
docker-compose up --detach
```

Stop it with:

```shell
docker-compose down
```

## Connect the folder

Once the server is running, go to [Connect a Folder](http://localhost:2345/connect-folder) and enter:

- **Name** — a name for the folder, such as `Documents` or `Music`.
- **Server Address** — the address of the computer or NAS running the server. Use <span style='white-space: nowrap'>`http://localhost:6543`</span> if it’s running on this computer, or an address like <span style='white-space: nowrap'>`http://servername.local:6543`</span> if it’s running on a NAS or another computer on your network.

## What's next

* [Connect Multiple Folders](/docs/connect-multiple-folders.html) — connect additional folders as separate workspaces.
* [Run with Node.js](/docs/run-with-nodejs.html) — run the server without Docker.
* [Connect from Other Devices](/docs/remote-access.html) — use your workspace from your phone, laptop, or away from home.
