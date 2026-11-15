---
parent: file-store-server
order: 6
---

# Update with Docker

If you're running the server with Docker, update it by pulling the latest image and recreating the container.

<p id="dockerContainerUnknown">Replace <code>&lt;service-name&gt;</code> below with your service's name, the key under <code>services:</code> in your <code>docker-compose.yml</code>.</p>

<pre><code>sudo docker-compose pull <span data-service-name>&lt;service-name&gt;</span>
sudo docker-compose up --detach <span data-service-name>&lt;service-name&gt;</span></code></pre>

<script>
  const serviceName = new URLSearchParams(window.location.search).get(
    'serviceName',
  );
  if (serviceName) {
    for (const el of document.querySelectorAll('[data-service-name]')) {
      el.textContent = serviceName;
    }
    document.getElementById('dockerContainerUnknown').hidden = true;
  }
</script>

## Updating everything

If you're running more than one server in the same compose file (see [Connect Multiple Folders](/docs/connect-multiple-folders.html)) and want to update them all at once:

```shell
sudo docker-compose pull
sudo docker-compose up --detach
```

If you're running the server with Node.js instead, see [Update with Node.js](/docs/update-npm.html).
