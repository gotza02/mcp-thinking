#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { SequentialThinkingServer } from './lib.js';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectKnowledgeGraph } from './graph.js';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const execAsync = promisify(exec);

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithRetry(url: string, options: any = {}, retries = 3, backoff = 1000): Promise<Response> {
    const fetchOptions = {
        ...options,
        headers: { ...DEFAULT_HEADERS, ...options.headers }
    };

    try {
        const response = await fetch(url, fetchOptions);
        
        if (response.status === 429 && retries > 0) {
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        
        if (!response.ok && retries > 0 && response.status >= 500) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }

        return response;
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}

const server = new McpServer({
    name: "sequential-thinking-server",
    version: "2026.1.18",
});

const thinkingServer = new SequentialThinkingServer(
    process.env.THOUGHTS_STORAGE_PATH || 'thoughts_history.json',
    parseInt(process.env.THOUGHT_DELAY_MS || '0', 10)
);
const knowledgeGraph = new ProjectKnowledgeGraph();

// --- Sequential Thinking Tool ---
server.tool("sequentialthinking",
    `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Iterative Reasoning: Think step-by-step in a structured manner
- Tree of Thoughts: Generate and evaluate multiple options (Conservative/Balanced/Aggressive)
- Self-Critique: Check for risks, biases, and errors in thinking
- Branch Merging: Combine insights from multiple divergent paths
- Hypothesis Testing: Formulate and verify hypotheses
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
  * Regular analytical steps
  * Revisions of previous thoughts
  * Questions about previous decisions
  * Realizations about needing more analysis
  * Changes in approach
  * Hypothesis generation
  * Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed
- thoughtType: The type of thought (analysis, generation, evaluation, reflexion, selection)
- score: Score for evaluation (1-10)
- options: List of options generated
- selectedOption: The option selected

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached`,
    {
        thought: z.string().describe("Your current thinking step"),
        nextThoughtNeeded: z.boolean().describe("Whether another thought step is needed"),
        thoughtNumber: z.number().int().min(1).describe("Current thought number (numeric value, e.g., 1, 2, 3)"),
        totalThoughts: z.number().int().min(1).describe("Estimated total thoughts needed (numeric value, e.g., 5, 10)"),
        isRevision: z.boolean().optional().describe("Whether this revises previous thinking"),
        revisesThought: z.number().int().min(1).optional().describe("Which thought is being reconsidered"),
        branchFromThought: z.number().int().min(1).optional().describe("Branching point thought number"),
        branchId: z.string().optional().describe("Branch identifier"),
        needsMoreThoughts: z.boolean().optional().describe("If more thoughts are needed"),
        thoughtType: z.enum(['analysis', 'generation', 'evaluation', 'reflexion', 'selection']).optional().describe("The type of thought"),
        score: z.number().min(1).max(10).optional().describe("Score for evaluation (1-10)"),
        options: z.array(z.string()).optional().describe("List of options generated"),
        selectedOption: z.string().optional().describe("The option selected")
    },
    async (args) => {
        const result = await thinkingServer.processThought(args);
        return {
            content: result.content,
            isError: result.isError
        };
    }
);

// --- New Tools ---

// 1. web_search
server.tool("web_search",
    "Search the web using Brave or Exa APIs (requires API keys in environment variables: BRAVE_API_KEY or EXA_API_KEY).",
    {
        query: z.string().describe("The search query"),
        provider: z.enum(['brave', 'exa', 'google']).optional().describe("Preferred search provider")
    },
    async ({ query, provider }) => {
        try {
            // Priority: User Preference > Brave > Exa > Google
            let selectedProvider = provider;
            if (!selectedProvider) {
                if (process.env.BRAVE_API_KEY) selectedProvider = 'brave';
                else if (process.env.EXA_API_KEY) selectedProvider = 'exa';
                else if (process.env.GOOGLE_SEARCH_API_KEY) selectedProvider = 'google';
                else return { content: [{ type: "text", text: "Error: No search provider configured. Please set BRAVE_API_KEY, EXA_API_KEY, or GOOGLE_SEARCH_API_KEY." }], isError: true };
            }

            if (selectedProvider === 'brave') {
                if (!process.env.BRAVE_API_KEY) throw new Error("BRAVE_API_KEY not found");
                const response = await fetchWithRetry(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                    headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY }
                });
                if (!response.ok) throw new Error(`Brave API error: ${response.statusText}`);
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data.web?.results || data, null, 2) }] };
            } 
            
            if (selectedProvider === 'exa') {
                if (!process.env.EXA_API_KEY) throw new Error("EXA_API_KEY not found");
                 const response = await fetchWithRetry('https://api.exa.ai/search', {
                    method: 'POST',
                    headers: {
                        'x-api-key': process.env.EXA_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query, numResults: 5 })
                });
                if (!response.ok) throw new Error(`Exa API error: ${response.statusText}`);
                const data = await response.json();
                return { content: [{ type: "text", text: JSON.stringify(data.results || data, null, 2) }] };
            }

            if (selectedProvider === 'google') {
                if (!process.env.GOOGLE_SEARCH_API_KEY) throw new Error("GOOGLE_SEARCH_API_KEY not found");
                if (!process.env.GOOGLE_SEARCH_CX) throw new Error("GOOGLE_SEARCH_CX (Search Engine ID) not found");
                
                const response = await fetchWithRetry(`https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=5`);
                
                if (!response.ok) throw new Error(`Google API error: ${response.statusText}`);
                const data = await response.json();
                
                // Extract relevant fields to keep output clean
                const results = data.items?.map((item: any) => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                })) || [];

                return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
            }

            return { content: [{ type: "text", text: "Error: Unsupported or unconfigured provider." }], isError: true };

        } catch (error) {
             return {
                content: [{ type: "text", text: `Search Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 2. fetch
server.tool("fetch",
    "Perform an HTTP request to a specific URL.",
    {
        url: z.string().url().describe("The URL to fetch"),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().default('GET').describe("HTTP Method"),
        headers: z.record(z.string(), z.string()).optional().describe("HTTP Headers"),
        body: z.string().optional().describe("Request body (for POST/PUT)")
    },
    async ({ url, method, headers, body }) => {
        try {
            const response = await fetchWithRetry(url, {
                method,
                headers: (headers as HeadersInit) || {},
                body: body
            });
            const text = await response.text();
            return {
                content: [{ 
                    type: "text", 
                    text: `Status: ${response.status}\n\n${text.substring(0, 10000)}${text.length > 10000 ? '\n...(truncated)' : ''}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Fetch Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 3. shell_execute
server.tool("shell_execute",
    "Execute a shell command. Use with caution.",
    {
        command: z.string().describe("The bash command to execute")
    },
    async ({ command }) => {
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                content: [{ 
                    type: "text", 
                    text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}` 
                }]
            };
        } catch (error) {
             return {
                content: [{ type: "text", text: `Shell Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 4. read_file
server.tool("read_file",
    "Read the contents of a file.",
    {
        path: z.string().describe("Path to the file")
    },
    async ({ path }) => {
        try {
            const content = await fs.readFile(path, 'utf-8');
            return {
                content: [{ type: "text", text: content }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Read Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 5. write_file
server.tool("write_file",
    "Write content to a file (overwrites existing).",
    {
        path: z.string().describe("Path to the file"),
        content: z.string().describe("Content to write")
    },
    async ({ path, content }) => {
        try {
            await fs.writeFile(path, content, 'utf-8');
            return {
                content: [{ type: "text", text: `Successfully wrote to ${path}` }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Write Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// --- Project Knowledge Graph Tools ---

// 6. build_project_graph
server.tool("build_project_graph",
    "Scan the directory and build a dependency graph of the project (Analyzing imports/exports).",
    {
        path: z.string().optional().default('.').describe("Root directory path to scan (default: current dir)")
    },
    async ({ path }) => {
        try {
            const result = await knowledgeGraph.build(path || '.');
            return {
                content: [{ type: "text", text: `Graph built successfully.\nNodes: ${result.nodeCount}\nTotal Scanned Files: ${result.totalFiles}` }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Graph Build Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 7. get_file_relationships
server.tool("get_file_relationships",
    "Get dependencies and references for a specific file from the built graph.",
    {
        filePath: z.string().describe("Path to the file (e.g., 'src/index.ts')")
    },
    async ({ filePath }) => {
        try {
            const rel = knowledgeGraph.getRelationships(filePath);
            if (!rel) {
                return {
                    content: [{ type: "text", text: `File not found in graph: ${filePath}. (Did you run 'build_project_graph'?)` }],
                    isError: true
                };
            }
            return {
                content: [{ type: "text", text: JSON.stringify(rel, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 8. get_project_graph_summary
server.tool("get_project_graph_summary",
    "Get a summary of the project structure (most referenced files, total count).",
    {},
    async () => {
        try {
            const summary = knowledgeGraph.getSummary();
            return {
                content: [{ type: "text", text: JSON.stringify(summary, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);


const app = express();

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
    console.log("New SSE connection established");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});

app.post("/messages", async (req, res) => {
    if (!transport) {
        res.status(400).send("No SSE connection established");
        return;
    }
    await transport.handlePostMessage(req, res);
});

async function runServer() {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.error(`Sequential Thinking MCP Server (Extended) running on SSE at http://localhost:${port}`);
        console.error(`- SSE endpoint: http://localhost:${port}/sse`);
        console.error(`- Messages endpoint: http://localhost:${port}/messages`);
    });
}

// --- New Tools v2026.1.27 ---

// 9. read_webpage
server.tool("read_webpage",
    "Read a webpage and convert it to clean Markdown (removes ads, navs, etc.).",
    {
        url: z.string().url().describe("The URL to read")
    },
    async ({ url }) => {
        try {
            const response = await fetchWithRetry(url);
            const html = await response.text();
            const doc = new JSDOM(html, { url });
            const reader = new Readability(doc.window.document);
            const article = reader.parse();
            
            if (!article) throw new Error("Could not parse article content");

            const turndownService = new TurndownService();
            const markdown = turndownService.turndown(article.content || "");

            return {
                content: [{ 
                    type: "text", 
                    text: `Title: ${article.title}\n\n${markdown}` 
                }]
            };
        } catch (error) {
             return {
                content: [{ type: "text", text: `Read Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 10. search_code
server.tool("search_code",
    "Search for a text pattern in project files (excludes node_modules, etc.).",
    {
        pattern: z.string().describe("The text to search for"),
        path: z.string().optional().default('.').describe("Root directory to search")
    },
    async ({ pattern, path: searchPath }) => {
        try {
             async function searchDir(dir: string): Promise<string[]> {
                 const results: string[] = [];
                 const entries = await fs.readdir(dir, { withFileTypes: true });
                 for (const entry of entries) {
                     const fullPath = path.join(dir, entry.name);
                     if (entry.isDirectory()) {
                         if (['node_modules', '.git', 'dist', 'coverage', '.gemini'].includes(entry.name)) continue;
                         results.push(...await searchDir(fullPath));
                     } else if (/\.(ts|js|json|md|txt|html|css|py|java|c|cpp|h|rs|go)$/.test(entry.name)) {
                         const content = await fs.readFile(fullPath, 'utf-8');
                         if (content.includes(pattern)) {
                             results.push(fullPath); 
                         }
                     }
                 }
                 return results;
             }
             
             const matches = await searchDir(path.resolve(searchPath || '.'));
             return {
                 content: [{ 
                     type: "text", 
                     text: matches.length > 0 ? `Found "${pattern}" in:\n${matches.join('\n')}` : `No matches found for "${pattern}"` 
                 }]
             };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Search Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

// 11. clear_thought_history
server.tool("clear_thought_history",
    "Clear the sequential thinking history.",
    {},
    async () => {
        await thinkingServer.clearHistory();
        return {
            content: [{ type: "text", text: "Thought history cleared." }]
        };
    }
);

// 12. summarize_history
server.tool("summarize_history",
    "Compress multiple thoughts into a single summary thought to save space/context.",
    {
        startIndex: z.number().int().min(1).describe("The starting thought number to summarize"),
        endIndex: z.number().int().min(1).describe("The ending thought number to summarize"),
        summary: z.string().describe("The summary text that replaces the range")
    },
    async ({ startIndex, endIndex, summary }) => {
        try {
            const result = await thinkingServer.archiveHistory(startIndex, endIndex, summary);
            return {
                content: [{ type: "text", text: `Successfully summarized thoughts ${startIndex}-${endIndex}. New history length: ${result.newHistoryLength}` }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Archive Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true
            };
        }
    }
);

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});