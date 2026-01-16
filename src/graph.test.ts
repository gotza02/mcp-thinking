
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectKnowledgeGraph } from './graph.js';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

describe('ProjectKnowledgeGraph', () => {
    let graph: ProjectKnowledgeGraph;

    beforeEach(() => {
        graph = new ProjectKnowledgeGraph();
        vi.resetAllMocks();
    });

    it('should ignore imports in comments', async () => {
        const mockFiles = ['/app/index.ts', '/app/utils.ts', '/app/oldUtils.ts'];
        const mockContentIndex = `
            import { something } from './utils';
            // import { oldThing } from './oldUtils';
            /* import { other } from './other' */
        `;
        const mockContentUtils = 'export const something = 1;';

        (fs.readdir as any).mockResolvedValue([
            { name: 'index.ts', isDirectory: () => false },
            { name: 'utils.ts', isDirectory: () => false },
            { name: 'oldUtils.ts', isDirectory: () => false }
        ]);
        
        (fs.readFile as any).mockImplementation(async (path: string) => {
            if (path.includes('index.ts')) return mockContentIndex;
            return '';
        });

        // Mock resolvePath behavior indirectly by mocking existing files check in graph.build logic
        // But since graph.ts uses fs.readdir recursively, we need to mock that structure.
        // For simplicity in this unit test, we'll mock 'getAllFiles' if it were public, 
        // but since it's private, we have to mock fs structure carefully or rely on the implementation.
        
        // Let's rely on the fact that build calls getAllFiles which calls readdir.
        // We need to ensure 'utils.ts' and 'oldUtils.ts' resolution is tested.
        // Actually, since we mock readFile, the file existence check in resolvePath uses "this.nodes.has".
        // "this.nodes" is populated by getAllFiles.
        
        // So we need getAllFiles to return both index.ts and utils.ts.
        // And NOT oldUtils.ts so we can see if it tries to resolve it?
        // Actually, if it tries to resolve 'oldUtils', it might fail if not in nodes.
        // But the bug is that it SHOULD NOT even try to resolve 'oldUtils' because it's commented out.
        
        await graph.build('/app');
        
        const relationships = graph.getRelationships('/app/index.ts');
        expect(relationships?.imports).toContain('utils.ts');
        expect(relationships?.imports).not.toContain('oldUtils.ts');
    });

    it('should resolve .js imports to .ts files', async () => {
        const mockContentIndex = `import { something } from './lib.js';`;
        
        (fs.readdir as any).mockResolvedValue([
            { name: 'index.ts', isDirectory: () => false },
            { name: 'lib.ts', isDirectory: () => false }
        ]);
        
        (fs.readFile as any).mockImplementation(async (filePath: string) => {
            if (filePath.endsWith('index.ts')) return mockContentIndex;
            return '';
        });

        await graph.build('/app');
        
        const relationships = graph.getRelationships('/app/index.ts');
        // The output of getRelationships.imports is relative paths.
        // If imports ./lib.js, and we have lib.ts, it should resolve to /app/lib.ts
        // And path.relative('/app', '/app/lib.ts') is 'lib.ts'
        expect(relationships?.imports).toContain('lib.ts');
    });

    it('should resolve .js imports to .jsx files', async () => {
        const mockContentIndex = `import { Button } from './Button.js';`;
        
        (fs.readdir as any).mockResolvedValue([
            { name: 'index.js', isDirectory: () => false },
            { name: 'Button.jsx', isDirectory: () => false }
        ]);
        
        (fs.readFile as any).mockImplementation(async (filePath: string) => {
            if (filePath.endsWith('index.js')) return mockContentIndex;
            return '';
        });

        await graph.build('/app');
        
        const relationships = graph.getRelationships('/app/index.js');
        expect(relationships?.imports).toContain('Button.jsx');
    });
});
