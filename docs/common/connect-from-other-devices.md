---
parent: file-store-server
order: 4
---

# Connect from Other Devices

You can use the same workspace from other devices, such as your phone or laptop, by connecting them to the same private network as your server. This works both at home and when you're away.

A service such as [Tailscale](https://tailscale.com/kb/1282/docker) can create a private network between your devices. Once connected, use your server's private network address as the **Server Address** in the app.

## Keep the server private

The server does not provide its own authentication. Anyone who can reach its address can access the folders you've connected.

Do not expose the server directly to the public internet. For access outside your home network, use a private network such as Tailscale instead.

Running the server with Docker provides an additional layer of protection. The server is isolated from the rest of the computer and only has access to the folders you've connected to it.
