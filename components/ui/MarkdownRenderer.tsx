import React from 'react';

const LINK_CLASS =
  'text-coffee-700 underline font-semibold hover:text-coffee-900 transition-colors';

/**
 * Only allow safe protocols and relative paths / anchors:
 * https://, http://, mailto:, tel:, /, #
 */
function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}

function isHttpHref(href: string): boolean {
  const trimmed = href.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

/**
 * Auto-link bare URLs (https://...), email addresses (mailto:),
 * and phone numbers (tel:, digits/+/spaces/dashes only, at least 8 digits).
 * WhatsApp values that are wa.me links are also converted to links.
 */
function renderAutoLinks(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];

  // Match URLs (including bare wa.me), emails, or phone numbers
  const regex =
    /(https?:\/\/[^\s<]+|wa\.me\/[^\s<]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(?<![\w/])(\+?\d[\d\s-]{6,}\d)(?![\w/])/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bare URL or wa.me link
      let rawUrl = match[1];
      let trailing = '';
      const trailingMatch = rawUrl.match(/[.,;:!?)]+$/);
      if (trailingMatch) {
        trailing = trailingMatch[0];
        rawUrl = rawUrl.slice(0, -trailing.length);
      }
      const href = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      nodes.push(
        <a
          key={`${keyPrefix}-url-${matchIdx++}`}
          href={href}
          className={LINK_CLASS}
          target="_blank"
          rel="noopener noreferrer"
        >
          {rawUrl}
        </a>
      );
      if (trailing) {
        nodes.push(trailing);
      }
    } else if (match[2]) {
      // Bare email address
      const email = match[2];
      nodes.push(
        <a
          key={`${keyPrefix}-email-${matchIdx++}`}
          href={`mailto:${email}`}
          className={LINK_CLASS}
        >
          {email}
        </a>
      );
    } else if (match[3]) {
      // Phone number candidate (digits/+/spaces/dashes only, >= 8 digits)
      const candidate = match[3];
      const digits = candidate.replace(/\D/g, '');
      if (digits.length >= 8) {
        const cleaned = candidate.replace(/[^\d+]/g, '');
        nodes.push(
          <a
            key={`${keyPrefix}-tel-${matchIdx++}`}
            href={`tel:${cleaned}`}
            className={LINK_CLASS}
          >
            {candidate}
          </a>
        );
      } else {
        nodes.push(candidate);
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Helper to render inline markdown: **bold**, [link](href), `code`
 */
function renderInlineText(text: string): React.ReactNode[] {
  // Regex to split by bold, link, code tokens
  const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-coffee-100/70 text-coffee-900 text-xs font-mono font-semibold"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const label = linkMatch[1];
      const href = linkMatch[2];

      if (isSafeHref(href)) {
        const isHttp = isHttpHref(href);
        return (
          <a
            key={index}
            href={href}
            className={LINK_CLASS}
            target={isHttp ? '_blank' : undefined}
            rel={isHttp ? 'noopener noreferrer' : undefined}
          >
            {label}
          </a>
        );
      }

      // Unsafe link: render link text as plain text without an <a>.
      // Do not touch text that is already inside [text](url).
      return <React.Fragment key={index}>{label}</React.Fragment>;
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-coffee-950">
          {renderAutoLinks(inner, `bold-${index}`)}
        </strong>
      );
    }

    return (
      <React.Fragment key={index}>
        {renderAutoLinks(part, `plain-${index}`)}
      </React.Fragment>
    );
  });
}

type MarkdownBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'p'; text: string };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push({ type: 'ul', items: [...currentList] });
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushList();
      continue;
    }

    // List item
    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      currentList.push(listMatch[1]);
      continue;
    }

    // Any non-list line flushes pending list
    flushList();

    // Headers
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }

  flushList();
  return blocks;
}

export default function MarkdownRenderer({
  content,
  className = '',
  skipFirstH1 = false,
}: {
  content: string;
  className?: string;
  skipFirstH1?: boolean;
}) {
  const blocks = parseMarkdownBlocks(content);
  let hasSkippedFirstH1 = false;

  return (
    <div className={`space-y-4 text-charcoal/80 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'h1') {
          if (skipFirstH1 && !hasSkippedFirstH1) {
            hasSkippedFirstH1 = true;
            return null;
          }
          return (
            <h1
              key={idx}
              className="text-2xl sm:text-3xl font-extrabold text-coffee-900 tracking-tight pt-4 first:pt-0 pb-1"
            >
              {renderInlineText(block.text)}
            </h1>
          );
        }

        if (block.type === 'h2') {
          return (
            <h2
              key={idx}
              className="text-lg sm:text-xl font-bold text-coffee-900 tracking-tight pt-6 first:pt-0 pb-1 border-b border-coffee-100/60"
            >
              {renderInlineText(block.text)}
            </h2>
          );
        }

        if (block.type === 'h3') {
          return (
            <h3
              key={idx}
              className="text-base sm:text-lg font-bold text-coffee-900 tracking-tight pt-4 pb-0.5"
            >
              {renderInlineText(block.text)}
            </h3>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={idx} className="space-y-2 my-3 pl-5 list-disc marker:text-coffee-600">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="text-sm sm:text-base leading-relaxed pl-1">
                  {renderInlineText(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="text-sm sm:text-base leading-relaxed">
            {renderInlineText(block.text)}
          </p>
        );
      })}
    </div>
  );
}
