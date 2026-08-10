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

You can also run the server directly with Node.js. This is simpler if you already use Node.js or don't want to set up Docker, but the server will have the same access to your computer as your user account.

### Docker

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

Then add each folder separately in the app, using the matching port.

Start it with:

```shell
docker compose up --detach
```

Stop it with:

```shell
docker compose down
```

Some NAS devices (for example, Synology's [Container Manager](https://kb.synology.com/en-us/DSM/help/ContainerManager/docker_desc)) support Docker directly through their admin UI, so you can run the same image there without a separate machine.

For additional folders, add another service with its own name, port, and folder:

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

### Node.js

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


## Connect the folder

Once the server is running, go to [Connect a Folder](http://localhost:2345/connect-folder) and enter:

- **Name** — a name for the folder, such as `Documents` or `Music`.
- **Server Address** — the address of the computer or NAS running the server. Use <span style='white-space: nowrap'>`http://localhost:6543`</span> if it’s running on this computer, or an address like <span style='white-space: nowrap'>`http://servername.local:6543`</span> if it’s running on a NAS or another computer on your network.



## Multiple folders

Each server connects a single folder. To use another folder, start another server for it using a different port, then add that folder as a separate connection in the app.


## Accessing your files on the go

To use your workspace from other devices, such as your phone or laptop, you can connect them through a private network. This also lets you access your files when you’re away from home.

A service such as [Tailscale](https://tailscale.com/kb/1282/docker) can provide this private connection. Once connected, use your server’s private network address as the **Server Address** in the app.

Avoid exposing the server directly to the public internet. The server does not provide its own authentication, so anyone who can reach its address can access the connected folder.

[Connect local or network storage →](/connect-folder)
