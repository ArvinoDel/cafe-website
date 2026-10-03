import React from 'react';

/**
 * Helper to render inline markdown: **bold**, [link](href), `code`
 */
function renderInlineText(text: string): React.ReactNode[] {
  // Regex to split by bold, link, code tokens
  const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-coffee-950">
          {part.slice(2, -2)}
        </strong>
      );
    }
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
      return (
        <a
          key={index}
          href={linkMatch[2]}
          className="text-coffee-700 underline font-semibold hover:text-coffee-900 transition-colors"
          target={linkMatch[2].startsWith('http') ? '_blank' : undefined}
          rel={linkMatch[2].startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
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
