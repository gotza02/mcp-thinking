import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SequentialThinkingServer, ThoughtData } from './lib.js';
import * as fs from 'fs';

describe('SequentialThinkingServer', () => {
    let server: SequentialThinkingServer;
    const testStoragePath = 'test_thoughts.json';

    beforeEach(() => {
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
        server = new SequentialThinkingServer(testStoragePath);
    });

    afterAll(() => {
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
    });

    it('should process a basic linear thought', async () => {
        const input: ThoughtData = {
            thought: "First step",
            thoughtNumber: 1,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            thoughtType: 'analysis'
        };

        const result = await server.processThought(input);
        expect(result.isError).toBeUndefined();
        
        const content = JSON.parse(result.content[0].text);
        expect(content.thoughtNumber).toBe(1);
        expect(content.thoughtHistoryLength).toBe(1);
    });

    it('should handle branching correctly', async () => {
        // Initial thought
        await server.processThought({
            thought: "Root thought",
            thoughtNumber: 1,
            totalThoughts: 3,
            nextThoughtNeeded: true
        });

        // Branch 1
        const branch1Input: ThoughtData = {
            thought: "Alternative A",
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            branchFromThought: 1,
            branchId: "branch-A",
            thoughtType: 'generation'
        };
        
        const result1 = await server.processThought(branch1Input);
        const content1 = JSON.parse(result1.content[0].text);
        expect(content1.branches).toContain("1-branch-A");

        // Branch 2
        const branch2Input: ThoughtData = {
            thought: "Alternative B",
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true,
            branchFromThought: 1,
            branchId: "branch-B",
            thoughtType: 'generation'
        };

        const result2 = await server.processThought(branch2Input);
        const content2 = JSON.parse(result2.content[0].text);
        expect(content2.branches).toContain("1-branch-B");
        expect(content2.branches.length).toBe(2);
    });

    it('should handle evaluation with scores', async () => {
        const input: ThoughtData = {
            thought: "Evaluating option X",
            thoughtNumber: 3,
            totalThoughts: 5,
            nextThoughtNeeded: true,
            thoughtType: 'evaluation',
            score: 8,
            options: ['Option X', 'Option Y']
        };

        const result = await server.processThought(input);
        expect(result.isError).toBeUndefined();
        // Since we don't return the score in the simple JSON response (only in logs or history),
        // we mainly check that it doesn't crash and processes correctly.
        // If we exposed history in the response, we could check that too.
    });

    it('should adjust totalThoughts if thoughtNumber exceeds it', async () => {
        const input: ThoughtData = {
            thought: "Unexpected long process",
            thoughtNumber: 6,
            totalThoughts: 5,
            nextThoughtNeeded: true
        };

        const result = await server.processThought(input);
        const content = JSON.parse(result.content[0].text);
        
        expect(content.totalThoughts).toBe(6);
    });
});
