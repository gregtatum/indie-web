---
section: Working with files
order: 1
---

# Markdown

Markdown gives you a portable way to write and organize ideas without locking
yourself into a proprietary editor. It stays readable as plain text, but can
render into headings, lists, links, and images.

## How it works here

- Markdown files render live in the preview.
- You can toggle the editor and read the rendered version full screen.
- Your files stay on your chosen storage, so they remain yours.

## Syntax

Markdown is a lightweight format that turns simple characters into structured
content. Here are the basics you will use most often:

Headings:

```
# H1
## H2
### H3
```

Paragraphs are just plain text separated by blank lines.

Emphasis:

```
*italic* or _italic_
**bold** or __bold__
```

Lists:

```
- Bulleted item
- Another item

1. Numbered item
2. Another item
```

Links:

```
[Link text](https://example.com)
```

Images:

```
![Alt text](./assets/photo.png)
```

Blockquotes:

```
> This is a quote.
```

Code:

```
Inline: `code`

```js
const value = 123;
```

Tables:

```
| Feature  | Notes               |
| -------- | ------------------- |
| Markdown | Simple and portable |
```

## Dropping images into a document

Drag an image file into the Markdown editor to upload it and insert an `<img>`
tag. The file is stored in a local `assets` folder next to the document, so it
travels with the markdown wherever you keep the folder.
