import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { docs } from '../data/docs.js';
import { examples } from '../data/examples.js';

// ─── Simple keyword search ─────────────────────────────────────────

function searchDocs(query: string, category?: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = docs
    .filter((d) => !category || d.category === category)
    .map((d) => {
      const haystack = `${d.title} ${d.keywords.join(' ')} ${d.content}`.toLowerCase();
      const hits = terms.filter((t) => haystack.includes(t)).length;
      return { doc: d, score: hits };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => ({
    id: s.doc.id,
    title: s.doc.title,
    category: s.doc.category,
    content: s.doc.content,
  }));
}

function searchExamples(query?: string, language?: string, tag?: string) {
  let results = examples;

  if (language) {
    results = results.filter((e) => e.language === language);
  }

  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter((e) => e.tags.some((et) => et.includes(t)));
  }

  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = results
      .map((e) => {
        const haystack = `${e.title} ${e.description} ${e.tags.join(' ')}`.toLowerCase();
        const hits = terms.filter((t) => haystack.includes(t)).length;
        return { example: e, score: hits };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    results = scored.map((s) => s.example);
  }

  return results.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    language: e.language,
    tags: e.tags,
    code: e.code,
  }));
}

// ─── Tool registration ─────────────────────────────────────────────

export function registerDocTools(server: McpServer): void {
  server.tool(
    'native_search_docs',
    'Search Native protocol documentation. No API key required. Returns guides on swaps, bridges, orderbook, configuration, error handling, and MCP setup.',
    {
      query: z.string().describe('Search query (e.g. "how to bridge", "error codes", "authentication")'),
      category: z
        .string()
        .optional()
        .describe('Filter by category: getting-started, swaps, bridges, data, reference, ai-integration'),
    },
    { readOnlyHint: true },
    async ({ query, category }) => {
      const results = searchDocs(query, category);

      if (results.length === 0) {
        const categories = [...new Set(docs.map((d) => d.category))];
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No docs matched your query. Try broader terms.',
                available_categories: categories,
                total_docs: docs.length,
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results, total: results.length }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'native_get_examples',
    'Browse and retrieve code examples for the Native platform. No API key required. Returns production-ready examples in TypeScript, Python, bash, and JSON.',
    {
      query: z.string().optional().describe('Search query (e.g. "swap", "bridge", "mcp setup")'),
      language: z
        .string()
        .optional()
        .describe('Filter by language: typescript, python, bash, json'),
      tag: z
        .string()
        .optional()
        .describe('Filter by tag: swap, bridge, orderbook, mcp, cli, quote, setup'),
    },
    { readOnlyHint: true },
    async ({ query, language, tag }) => {
      const results = searchExamples(query, language, tag);

      if (results.length === 0) {
        const allTags = [...new Set(examples.flatMap((e) => e.tags))];
        const allLangs = [...new Set(examples.map((e) => e.language))];
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No examples matched. Try broader filters.',
                available_tags: allTags,
                available_languages: allLangs,
                total_examples: examples.length,
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results, total: results.length }, null, 2),
          },
        ],
      };
    },
  );
}
