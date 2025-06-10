# FloppyDisk.link File Server

Run your own file server for [FloppyDisk.link](https://floppydisk.link).

First create a `docker-compose.yml`, or add to an existing one.

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

After adding this service to your docker-compose file you can run it with:

```shell
docker compose up --detach
```

If you want to stop it you can run:

```shell
docker compose down
```

## Setting it up on a Synology NAS

Some Synology NAS (network attached storage) versions let you use Docker. To get started with Docker [this guide can be helpful](https://www.virtualizationhowto.com/2023/02/docker-compose-synology-nas-install-and-configuration/).

## Security

By default, the only access control is IP-based. To avoid exposing your file server to your local network or public internet, you can tunnel it through a private network such as [Tailscale](https://tailscale.com/).

You can set up a [Tailscale VPN by following this guide](https://tailscale.com/kb/1282/docker), and the file server will only be accessible within your Tailscale network.

```yaml
---
services:
  tailscale-floppydisk:
    image: tailscale/tailscale:latest
    hostname: tailscale-floppydisk
    environment:
      - TS_AUTHKEY=tskey-client-notAReal-OAuthClientSecret1Atawk
      - TS_EXTRA_ARGS=--advertise-tags=tag:container
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - ${PWD}/tailscale-floppydisk/state:/var/lib/tailscale
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
    restart: unless-stopped

  floppydisk:
    image: tatumcreative/floppydisk.link:latest
    # This ensures that Tailscale starts first:
    depends_on:
      - tailscale-floppydisk
    # Share network stack with Tailscale.
    network_mode: service:tailscale-floppydisk
    # ...
    # Add the rest of the configuration from above.
```
