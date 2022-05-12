# Browser Chords

Manage tabs, chords, and sheet music in Dropbox, and access and edit them directly in the browser, anywhere.

This is a side project to make it easier for me to manage my music collection, and maintain control of the files simply through Dropbox. Many apps can lock you into their systems, but this one focuses on just having files that you are in control of. It purely runs on the front-end, and then access the Dropbox API to handle the file management.

## Architecture

The front-end is built in [TypeScript](https://www.typescriptlang.org/) using [React](https://reactjs.org/) for the component system. It is using [React Hooks](https://reactjs.org/docs/hooks-reference.html) and functional components for the component management. The state is centrally controlled using [Redux](https://redux.js.org/). The state is accessed using selectors and the [reselect](https://github.com/reduxjs/reselect) to provide functional memoization for state changes.

The build process is managed by [Webpack](https://webpack.js.org/). Hosting is done through [Netlify](https://www.netlify.com/). The routing of the URLs is all handled through the front-end. Testing is handled through [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

Dropbox uses an in-browser [PKCE OAuth](https://dropbox.tech/developers/pkce--what-and-why-) flow to securely log you in. This app gets access to a subfolder in the `Dropbox/Apps` folder to limit the access to

## Supported Formats

### ChordPro

This project supports basic [ChordPro](https://www.chordpro.org/) (.chopro) files for viewing and editing, with more of the features of the format planned for implementation.

Planned features include, but are not limited to:

 * Inline images
 * Chord transposing
 * Styling directives

### PDF

PDF Files are rendered directly in the browser through [PDF.js](https://mozilla.github.io/pdf.js/). This is great for playing sheet music on tablets.

### Planned formats

 * Image formats browsers can natively render, such as .jpg, .png
 * Musescore files (viewing only)

## Additional planned/stretch features

 * Auto-scrolling
 * Spotify integration
 * Dropbox mp3 play-along integration

## License

The code is open source licensed as GPLv3.
