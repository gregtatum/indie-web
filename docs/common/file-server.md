---
parent: file-store-server
order: 1
---

# File Server

This page covers how to run and configure the file server that connects a folder from your computer, home server, or NAS to the app. For the shortest path to get connected, see [Local & Network Storage](/docs/file-store-server.html).

## Docker

Docker is the recommended way to run the server. It keeps the server isolated from the rest of the system and is generally the safer option.

Some NAS devices (for example, Synology's [Container Manager](https://kb.synology.com/en-us/DSM/help/ContainerManager/docker_desc)) support Docker directly through their admin UI, so you can run the same image there without a separate machine.

### Connecting multiple folders

Each server instance connects a single folder. For additional folders, add another service with its own name, port, and folder:

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

### Running multiple servers

Each server instance connects a single folder. To connect another folder, start another instance on a different port and mount path:

```shell
PORT=6544 MOUNT_PATH=/path/to/music npm start
```

## Accessing your files on the go

To use your workspace from other devices, such as your phone or laptop, you can connect them through a private network. This also lets you access your files when you’re away from home.

A service such as [Tailscale](https://tailscale.com/kb/1282/docker) can provide this private connection. Once connected, use your server’s private network address as the **Server Address** in the app.

## Security

By default, access to the server is controlled only by network reachability, so anyone who can reach the address can use it. The server does not provide its own authentication, so avoid exposing it directly to the public internet, and use a private network like Tailscale for remote access instead.

Running the server in Docker limits what an attacker can reach if it's ever compromised, since the server only has access to the container and the folder you've mounted into it.

[Local & Network Storage ←](/docs/file-store-server.html)
