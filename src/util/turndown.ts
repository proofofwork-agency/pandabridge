import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Strip non-content elements
for (const tag of ['script', 'style', 'noscript', 'iframe', 'nav', 'footer'] as const) {
  turndown.remove(tag);
}

export { turndown };
