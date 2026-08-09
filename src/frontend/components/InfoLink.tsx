import * as React from 'react';
import './InfoLink.css';
import { Tooltip } from './Tooltip';

interface InfoLink {
  /** Path to a doc page, e.g. "/docs/file-store-dropbox.html" */
  href: string;
  /** Short blurb shown as the link's tooltip. */
  title: string;
}

/**
 * A small inline icon linking out to the static docs site.
 */
export function InfoLink(props: InfoLink) {
  return (
    <Tooltip text={props.title}>
      <a className="infoLink" href={props.href} aria-label="Info link">
        <span className="infoLinkIcon" />
      </a>
    </Tooltip>
  );
}
