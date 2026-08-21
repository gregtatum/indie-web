---
parent: file-store-server
order: 6
---

# Update with Docker

If you're running the server with Docker, update it by pulling the latest image and recreating the container.

<p id="dockerContainerUnknown">Replace <code>&lt;container-name&gt;</code> below with your container's name. Find it with <code>docker ps</code> if you're not sure.</p>

<pre><code>docker-compose pull <span data-container-name>&lt;container-name&gt;</span>
docker-compose up --detach <span data-container-name>&lt;container-name&gt;</span></code></pre>

<script>
  const containerName = new URLSearchParams(window.location.search).get(
    'containerName',
  );
  if (containerName) {
    for (const el of document.querySelectorAll('[data-container-name]')) {
      el.textContent = containerName;
    }
    document.getElementById('dockerContainerUnknown').hidden = true;
  }
</script>

## Updating everything

If you're running more than one server in the same compose file (see [Connect Multiple Folders](/docs/connect-multiple-folders.html)) and want to update them all at once:

```shell
docker-compose pull
docker-compose up --detach
```

If you're running the server with Node.js instead, see [Update with Node.js](/docs/update-npm.html).
