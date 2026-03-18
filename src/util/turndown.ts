import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Strip non-content elements
turndown.remove(['script', 'style', 'noscript', 'iframe', 'nav', 'footer'] as any);

export { turndown };
