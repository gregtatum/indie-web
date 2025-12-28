# File stores

## Local browser storage

Local storage keeps files in your browser using [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). It is quick and private, but clearing
your browser data will remove all files. The files are tied to your browser.

## Dropbox

[/dropbox](Connecting Dropbox) lets you access files across devices. Your files will be sandbox to the Dropbox/Apps folder, so that the rest of your files remain private.

## Server store

If configured, a [server-backed store](/add-file-storage) can keep files in a shared location, for instance on your same computer, or on an external storage such as a NAS (Network Attached Storage). The server only has access the folder where you mount it. You can mount multiple folders.
