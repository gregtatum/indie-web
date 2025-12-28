---
section: Working with files
order: 1
---

# PDFs and images

PDFs and images live alongside your other files. Drop them into any folder and
open them directly from the file list.

## PDFs

- PDFs open in a full-screen reader.
- Pages are rendered to fit your screen width for easy scrolling.
- Use the left/right arrow keys, or swipe on touch devices, to jump to the
  previous or next file in the folder.

## Images

Images open in a full-screen viewer with the same next/previous navigation as
PDFs.

## Using images inside files

- In Markdown, drag and drop an image into the editor to upload it and insert
  an `<img>` tag. You can rename the file during the upload. It will be placed in
  an `./assets` folder within your current folder.
- In ChordPro, use the `{image: src="..."}`
  directive or drag and drop an image onto the rendered view to insert one
  automatically.

Image paths can be absolute (starting with `/`) or relative to the file's
folder, which makes it easy to keep exports in an `assets` subfolder.
