
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectKnowledgeGraph } from './graph.js';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

describe('ProjectKnowledgeGraph Reproduction', () => {
    let graph: ProjectKnowledgeGraph;

    beforeEach(() => {
        graph = new ProjectKnowledgeGraph();
        vi.resetAllMocks();
    });

    it('should resolve absolute imports from project root', async () => {
        // Scenario: /app/src/feature/a.ts imports 'src/shared/b.ts'
        const mockContentA = `import { b } from 'src/shared/b';`;
        
        (fs.readdir as any).mockResolvedValue([
            { name: 'src', isDirectory: () => true },
            { name: 'feature', isDirectory: () => true },
            { name: 'shared', isDirectory: () => true },
            { name: 'a.ts', isDirectory: () => false },
            { name: 'b.ts', isDirectory: () => false }
        ]);

        // Mock getAllFiles behavior by manually setting up the file system structure conceptually
        // Since getAllFiles is recursive and hard to mock perfectly with just readdir,
        // we'll focus on the result of getAllFiles which populates the graph.
        // Wait, the test uses the REAL getAllFiles, so we must mock readdir correctly.
        
        // Let's simplify: Flat structure for test.
        // Root: /app
        // Files: /app/a.ts, /app/b.ts
        // a.ts content: "import ... from 'b'" (no dot)
        // OR
        // a.ts content: "import ... from 'app/b'" (if root is /)
        
        // Let's try the 'src/...' pattern which is common.
        // Root: /root
        // File: /root/src/index.ts -> imports 'src/utils'
        // File: /root/src/utils.ts
        
        const rootDir = '/root';
        const indexFile = '/root/src/index.ts';
        const utilsFile = '/root/src/utils.ts';

        // Mock readdir to simulate:
        // /root -> [src]
        // /root/src -> [index.ts, utils.ts]
        (fs.readdir as any).mockImplementation(async (dir: string) => {
            if (dir === '/root') return [{ name: 'src', isDirectory: () => true }];
            if (dir === '/root/src') return [
                { name: 'index.ts', isDirectory: () => false },
                { name: 'utils.ts', isDirectory: () => false }
            ];
            return [];
        });

        (fs.readFile as any).mockImplementation(async (filePath: string) => {
            if (filePath === indexFile) return `import { u } from 'src/utils';`;
            return '';
        });

        await graph.build(rootDir);
        
        const relationships = graph.getRelationships(indexFile);
        
        // We expect 'src/utils.ts' to be in imports.
        // Note: graph.getRelationships returns relative paths.
        // relative('/root', '/root/src/utils.ts') -> 'src/utils.ts'
        expect(relationships?.imports).toContain('src/utils.ts');
    });
});
