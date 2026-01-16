# Sequential Thinking MCP Server

An MCP server implementation that provides a tool for dynamic and reflective problem-solving through a structured thinking process (Tree of Thoughts, Self-Reflexion).

## Features

- **Sequential Analysis**: Break down complex problems into manageable linear steps.
- **Iterative Reasoning**: Think step-by-step in a structured manner, refining insights in loops.
- **Tree of Thoughts**: Generate and evaluate multiple options, exploring Conservative, Balanced, and Aggressive strategies.
- **Self-Critique**: Actively check for risks, biases, and potential errors in the thinking process.
- **Branch Merging**: Synthesize and combine insights from multiple divergent reasoning paths.
- **Hypothesis Testing**: Formulate specific hypotheses and verify them against evidence or logic.
- **Option Evaluation**: Score and weigh different options (`evaluation`) to make informed decisions.
- **Self-Reflexion**: Review and correct previous thoughts (`reflexion`) to improve accuracy.
- **Dynamic Adjustment**: Adjust the total number of thoughts dynamically as understanding deepens.

## System Instruction for AI

When connected to this server, you should follow these guidelines to maximize problem-solving effectiveness:

1.  **Iterative Thinking**: Use the `sequentialthinking` tool for every complex task. Do not try to provide a final answer immediately. Instead, break the problem into steps, generate hypotheses, and evaluate them.
2.  **Context Discovery**: Before modifying code, always use `build_project_graph` followed by `get_project_graph_summary` to understand the project architecture. Use `get_file_relationships` to see how specific files are connected.
3.  **Fact Verification**: Use `web_search` to verify current facts, library versions, or documentation. Use `fetch` to retrieve raw data from external sources when needed.
4.  **Local Execution**: Use `shell_execute` to run tests, linters, or build commands to verify your changes. Always read files using `read_file` before attempting to write or modify them.
5.  **Persistence**: The thinking process is saved automatically. You can resume previous sessions by reviewing the `thoughts_history.json` file if needed.

## Detailed Tool Guide

### 🧠 Cognitive Tools

#### `sequentialthinking`
The core engine for structured problem-solving. It forces a step-by-step analysis before arriving at a conclusion.

**Inputs:**
- `thought` (string, required): The content of the current thinking step.
- `thoughtNumber` (integer, required): Current step number (starts at 1).
- `totalThoughts` (integer, required): Estimated total steps needed (can be adjusted dynamically).
- `nextThoughtNeeded` (boolean, required): `true` if you need to think more, `false` only when the final answer is ready.
- `thoughtType` (enum): The nature of the thought:
  - `analysis`: Breaking down the problem.
  - `generation`: Brainstorming solutions.
  - `evaluation`: Weighing options (use with `score`).
  - `reflexion`: Reviewing previous thoughts (use with `isRevision`).
  - `selection`: Choosing a path.
- `isRevision` (boolean): Set to `true` if you are correcting a previous mistake.
- `revisesThought` (integer): The thought number you are fixing.
- `branchFromThought` (integer): The parent thought number if creating a new reasoning branch.
- `branchId` (string): A name for the new branch.

**Best Practice:** Use this for ANY non-trivial task. Don't just answer; think first.

#### `clear_thought_history`
Clears the stored thinking history. Use this to start fresh or free up context.

#### `summarize_history`
Compresses multiple thoughts into a single summary thought. This is essential for long reasoning chains to save token context while preserving the core insights.

**Inputs:**
- `startIndex` (integer): Start of the range to summarize.
- `endIndex` (integer): End of the range to summarize.
- `summary` (string): The summary text that replaces the range.

### 🌐 External Knowledge

#### `web_search`
Retrieves real-time information from the internet.

**Inputs:**
- `query` (string, required): What you want to find.
- `provider` (enum, optional):
  - `brave`: General web search (Requires `BRAVE_API_KEY`).
  - `exa`: AI-optimized search for deep content (Requires `EXA_API_KEY`).
  - `google`: Google Custom Search (Requires `GOOGLE_SEARCH_API_KEY` & `GOOGLE_SEARCH_CX`).

#### `fetch`
Performs a direct HTTP request to a URL. Useful for getting raw HTML, JSON, or text from a specific source found via search.

**Inputs:**
- `url` (string, required): The target URL.
- `method`: `GET` (default), `POST`, `PUT`, `DELETE`.
- `headers`: JSON object for headers (e.g., `{"Authorization": "Bearer..."}`).
- `body`: Request body for POST/PUT.

#### `read_webpage`
Reads a webpage and converts it to clean Markdown, removing ads and navigation. Great for reading articles or documentation to save tokens.

**Inputs:**
- `url` (string, required): The URL to read.

### 🏗 Codebase Intelligence

#### `build_project_graph`
**RUN THIS FIRST** when entering a new project. It scans the directory and builds a map of file dependencies using TypeScript AST analysis. Now also extracts **exported symbols** (Functions, Classes, Variables) to provide deeper structural insight.

**Inputs:**
- `path` (string, optional): Root directory (defaults to `.`).

#### `get_project_graph_summary`
Returns high-level stats: total files and the top 5 most-referenced files. Use this to identify the "core" modules of the application.

#### `get_file_relationships`
Zoom in on a specific file to see its context.

**Inputs:**
- `filePath` (string, required): Path to the file (e.g., `src/index.ts`).
**Returns:**
- `imports`: What this file needs.
- `importedBy`: Who relies on this file.

#### `search_code`
Searches for a text pattern across all code files in the project. Useful for finding usage examples or specific logic.

**Inputs:**
- `pattern` (string, required): Text to search for.
- `path` (string, optional): Root directory (defaults to `.`).

### 🛠 System Operations

#### `read_file`
Reads the content of a file. Always read a file before editing it to ensure you have the latest context.

**Inputs:**
- `path` (string, required): File path.

#### `write_file`
Creates or overwrites a file.

**Inputs:**
- `path` (string, required): File path.
- `content` (string, required): The full content to write.

#### `shell_execute`
Executes a shell command. Use for running tests (`npm test`), building (`npm run build`), or file operations (`ls`, `mkdir`).

**Inputs:**
- `command` (string, required): The command line string.
**Warning:** Use with caution. Avoid commands that might delete data or expose secrets.

## Recommended System Instruction

To optimize your AI agent's performance with these tools, we recommend adding the following instructions to its system prompt:

```text
# Tools & Workflow

1.  **Core Reasoning (`sequentialthinking`)**
    *   **Mandatory Step:** For any complex query, bug fix, or feature request, you MUST start by using the `sequentialthinking` tool.
    *   **Methodology:** Break the problem down. If your first hypothesis fails, use the tool again to revise your plan (`isRevision: true`).
    *   **Goal:** Do not output code or final answers until you have a clear, verified plan.

2.  **Codebase Navigation**
    *   **Initial Scan:** On start, run `build_project_graph`.
    *   **Context:** Before reading a file, check its context with `get_file_relationships`. This prevents "hallucinating" imports or breaking existing dependencies.

3.  **External Verification**
    *   **Docs & Facts:** If you need to use a library you aren't 100% sure about, use `web_search` to check the documentation.

4.  **Safety & Persistence**
    *   **Files:** Always `read_file` before `write_file`.
    *   **History:** Your thoughts are saved. If you get stuck, review your previous thoughts.
```

## Usage

The Sequential Thinking tool is designed for:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

## Configuration

### Environment Variables
- `THOUGHT_DELAY_MS`: (Optional) Milliseconds to wait before processing each thought. Default: `0`.
- `DISABLE_THOUGHT_LOGGING`: (Optional) Set to `true` to hide colored logs.
- `THOUGHTS_STORAGE_PATH`: (Optional) Path to history file. Default: `thoughts_history.json`.

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`. You can configure API keys directly here:

#### npx

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@gotza02/sequential-thinking"
      ],
      "env": {
        "BRAVE_API_KEY": "YOUR_BRAVE_API_KEY",
        "EXA_API_KEY": "YOUR_EXA_API_KEY",
        "GOOGLE_SEARCH_API_KEY": "YOUR_GOOGLE_SEARCH_API_KEY",
        "GOOGLE_SEARCH_CX": "YOUR_GOOGLE_SEARCH_CX"
      }
    }
  }
}
```

### Usage with VS Code

For quick installation, click one of the installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40gotza02%2Fsequential-thinking%22%5D%7D)

## Building

```bash
npm install
npm run build
```

## Testing

```bash
npm test
```

## Recent Updates (v2026.1.28)
- **Robustness**:
  - Implemented **Atomic Writes** for `thoughts_history.json` to prevent file corruption.
  - Added **Internal Locking** to handle concurrent save requests gracefully.
  - Added **API Retry Logic** with exponential backoff for all search and web tools (handles HTTP 429/5xx).
  - Improved HTTP requests with browser-like headers (User-Agent) to reduce blocking.
- **New Tools**:
  - `summarize_history`: Archive and condense long reasoning chains.
- **Graph Enhancements**:
  - Added **Symbol Extraction**: The project graph now tracks exported functions, classes, and variables.

## Recent Updates (v2026.1.27)
- **New Tools**:
  - `read_webpage`: Convert webpages to Markdown for efficient reading.
  - `search_code`: Recursive text search in code files.
  - `clear_thought_history`: Reset the thinking process.

## Recent Updates (v2026.1.26)

- **Rate Limiting**:
  - Added `THOUGHT_DELAY_MS` environment variable to introduce a delay between thought steps. This helps prevent request flooding and rate limit issues.

## Recent Updates (v2026.1.24)

- **Bug Fixes**:
  - Fixed `get_file_relationships` to correctly resolve absolute imports and imports from project root (e.g., `src/utils`), ensuring the dependency graph is complete for projects using path aliases or absolute paths.

## Recent Updates (v2026.1.22)

- **Environment Variables**:
  - Renamed Google Search environment variables to `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_CX` to avoid conflicts and improve clarity.

## Recent Updates (v2026.1.21)

- **Performance & Accuracy**:
  - Replaced Regex-based code analysis with **TypeScript Compiler API (AST)** for 100% accurate import/export detection.
  - Improved `web_search` robustness and error handling.
- **Persistence**:
  - Implemented **File-based Persistence** for the thinking process. Your thoughts are now saved to `thoughts_history.json` automatically.
  - Switched to **Asynchronous File I/O** to prevent server blocking.
- **Bug Fixes**:
  - Fixed duplicate import entries in the project graph.
  - Resolved memory growth issues in long-running sessions.

## Recent Updates (v2026.1.20)

- **New Features**:
  - Added support for **Google Custom Search** in the `web_search` tool. (Requires `GOOGLE_API_KEY` and `GOOGLE_CX`).

## Recent Updates (v2026.1.18)

- **Bug Fixes**:
  - Fixed an issue where commented-out imports were incorrectly parsed by the graph analyzer.
  - Resolved a branching logic issue where branch IDs could collide.
  - Fixed version mismatch between package.json and server instance.

## License

This MCP server is licensed under the MIT License.