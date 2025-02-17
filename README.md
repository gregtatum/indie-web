# Indie Web Projects

This is a mono-repo for my [indie web](https://en.wikipedia.org/wiki/IndieWeb) projects.

# 💾 [FloppyDisk.link](https://floppydisk.link/)

When I was a kid I would have my game saves, school projects, and other important documents stored on floppy disks so that I can take them places. This website is a collection of tools for viewing and manipulating files. Mostly it supports markdown editing, and can save in the browser, or to DropBox.

# 🎵 [Browser Chords](https://browserchords.com/)

Manage tabs, chords, and sheet music in your browser. This is how I organize my music collection. Many apps can lock you into their systems, but this one focuses on just having files that you are in control of. It's really just another front for FloppyDisk, but more tailored for music.

## Architecture

The front-end is built in [TypeScript](https://www.typescriptlang.org/) using [React](https://reactjs.org/) for the component system. It is using [React Hooks](https://reactjs.org/docs/hooks-reference.html) and functional components for the component management. The state is centrally controlled using [Redux](https://redux.js.org/). The state is accessed using selectors and the [reselect](https://github.com/reduxjs/reselect) to provide functional memoization for state changes.

The build process is managed by [Webpack](https://webpack.js.org/). Hosting is done through [Netlify](https://www.netlify.com/). The routing of the URLs is all handled through the front-end. Testing is handled through [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

Dropbox uses an in-browser [PKCE OAuth](https://dropbox.tech/developers/pkce--what-and-why-) flow to securely log you in. This app gets access to a subfolder in the `Dropbox/Apps` folder to limit the access to files.

The site is broken down into three code areas:

1. [`src/frontend`](https://github.com/gregtatum/indie-web/tree/main/src/frontend) - Code that runs in the browser.
2. [`src/server`](https://github.com/gregtatum/indie-web/tree/main/src/server) - Code that runs in node.
3. [`src/shared`](https://github.com/gregtatum/indie-web/tree/main/src/shared) - Code that runs in either place.

I use path aliases to import these with absolute paths. I find this easier to maintain the codebase, as the paths are more explicit, and makes it easier to refactor code.

```js
import { App } from 'frontend/components/App';
```

I use a few aliases for common pieces of code.

```js
import { T, $, $$, A } from 'frontend';
```

1. `T` - All of the TypeScript types exported under a single namespace.
2. `$` - All of the redux selectors.
3. `$$` - All of the redux selectors wrapped in a `useSelector` hook.
4. `A` - All of the redux actions.

I prefer this flat structure as it makes code organization so much simpler. I would prefer a long selector name for instance compared to a bunch of complicated folder structures that I would have to navigate.

## Supported Formats

### Markdown

It's quite simple to edit markdown files. I use FloppyDisk.link to write and manage all of my D&D campaign notes.

### ChordPro

This project supports basic [ChordPro](https://www.chordpro.org/) (.chopro) files for viewing and editing. It supports chord transposition. Images can be embedded as well.

### PDF

PDF Files are rendered directly in the browser through [PDF.js](https://mozilla.github.io/pdf.js/). This is great for playing sheet music on tablets.

### Images

The [image formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types) that are supported by the browser can be viewed.

## License

The code is open source licensed as GPLv3.
