---
parent: file-store-server
order: 4
---

# Remote Access

To use your workspace from other devices, such as your phone or laptop, you can connect them through a private network. This also lets you access your files when you’re away from home.

A service such as [Tailscale](https://tailscale.com/kb/1282/docker) can provide this private connection. Once connected, use your server’s private network address as the **Server Address** in the app.

## Security

By default, access to the server is controlled only by network reachability, so anyone who can reach the address can use it. The server does not provide its own authentication, so avoid exposing it directly to the public internet, and use a private network like Tailscale for remote access instead.

Running the server in Docker limits what an attacker can reach if it's ever compromised, since the server only has access to the container and the folder you've mounted into it.

[Local & Network Storage ←](/docs/file-store-server.html)
