---
section: File stores
order: 4
---

# Local & Network Storage

Local and network storage lets you use folders from your computer, a home server, or a network storage device (NAS) as a workspace. It’s a good choice when you already keep your files on your own hardware or want to work directly with existing folders.

Only the folders you choose are accessible, and you can connect multiple folders as separate workspaces.

Your files remain ordinary files on your storage, so you can open, edit, move, or back them up with other tools as usual.

Getting this running has two parts: start a small server next to your files, then connect to it from the app.

## 1: Start the server

Pick whichever fits the machine you're running it on.

### Option A: Docker (recommended for a NAS or always-on machine)

Create a `docker-compose.yml` next to the folder you want to serve, or add this service to an existing one:

```yaml
services:
  floppydisk:
    # Use the latest published Docker image.
    image: tatumcreative/floppydisk.link:latest
    # The name of the running container.
    container_name: floppydisk
    # Automatically restart the container unless it is explicitly stopped.
    restart: unless-stopped
    ports:
      # Expose the container's internal port 6543 on the host machine.
      # Change the number on the left if you need to use a different external port.
      - "6543:6543"
    volumes:
      # Mount a local folder into the container at /app/mount.
      # Replace "./mount" with the path to the folder you want to serve.
      - ./mount:/app/mount
```

Start it with:

```shell
docker compose up --detach
```

Stop it with:

```shell
docker compose down
```

Some NAS devices (for example, Synology) support Docker directly through their admin UI, so you can run the same image there without a separate machine.

### Option B: Run from source with Node.js

```shell
git clone git@github.com:gregtatum/indie-web.git
cd indie-web/src/server
npm install
npm start
```

The server listens on port `6543` by default and serves the repo's `mount` folder. Set the `PORT` or `MOUNT_PATH` environment variables to change either.

## 2: Connect the folder

Once the server is running, go to [Connect a Folder](/connect-folder) and fill in:

- **Name** — any label to identify this folder in the app.
- **Server Address** — where the server is reachable, for example `http://localhost:6543` on the same machine, or `http://<host-ip>:6543` for a NAS or another machine on your network.

## Multiple folders

Each server instance serves a single mounted folder. To connect more than one folder (for example, a separate music library), run another server instance on a different port and add it in the app as its own connection, pointing at that port.

## Security

By default, access to the server is controlled only by network reachability — anyone who can reach the address can use it. Avoid exposing it directly to the public internet. To reach it securely from other devices, consider tunneling it through a private network such as [Tailscale](https://tailscale.com/kb/1282/docker).

[Connect local or network storage →](/connect-folder)
