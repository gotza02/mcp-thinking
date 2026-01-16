import chalk from 'chalk';
import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  thoughtType?: 'analysis' | 'generation' | 'evaluation' | 'reflexion' | 'selection';
  score?: number;
  options?: string[];
  selectedOption?: string;
}

export class SequentialThinkingServer {
    private thoughtHistory: ThoughtData[] = [];
    private branches: Record<string, ThoughtData[]> = {};
    private disableThoughtLogging: boolean;
    private storagePath: string;
    private delayMs: number;

    private isSaving: boolean = false;

    constructor(storagePath: string = 'thoughts_history.json', delayMs: number = 0) {
        this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
        this.storagePath = path.resolve(storagePath);
        this.delayMs = delayMs;
        this.loadHistory();
    }

    private loadHistory() {
        try {
            if (existsSync(this.storagePath)) {
                const data = readFileSync(this.storagePath, 'utf-8');
                const history = JSON.parse(data);
                if (Array.isArray(history)) {
                    this.thoughtHistory = []; // Reset to avoid duplicates
                    this.branches = {};
                    history.forEach(thought => this.addToMemory(thought));
                }
            }
        } catch (error) {
            console.error(`Error loading history from ${this.storagePath}:`, error);
        }
    }

    private async saveHistory() {
        if (this.isSaving) {
            // Simple retry if already saving
            setTimeout(() => this.saveHistory(), 100);
            return;
        }
        this.isSaving = true;
        try {
            // Atomic write: write to tmp then rename
            const tmpPath = `${this.storagePath}.tmp`;
            await fs.writeFile(tmpPath, JSON.stringify(this.thoughtHistory, null, 2), 'utf-8');
            await fs.rename(tmpPath, this.storagePath);
        } catch (error) {
            console.error(`Error saving history to ${this.storagePath}:`, error);
        } finally {
            this.isSaving = false;
        }
    }

    public async clearHistory() {
        this.thoughtHistory = [];
        this.branches = {};
        await this.saveHistory();
    }

    public async archiveHistory(startIndex: number, endIndex: number, summary: string) {
        if (startIndex < 1 || endIndex > this.thoughtHistory.length || startIndex > endIndex) {
            throw new Error(`Invalid range: ${startIndex} to ${endIndex}. History length is ${this.thoughtHistory.length}.`);
        }

        const summaryThought: ThoughtData = {
            thought: `SUMMARY [${startIndex}-${endIndex}]: ${summary}`,
            thoughtNumber: startIndex,
            totalThoughts: this.thoughtHistory[this.thoughtHistory.length - 1].totalThoughts - (endIndex - startIndex),
            nextThoughtNeeded: true,
            thoughtType: 'analysis'
        };

        // Remove the range and insert summary
        const removedCount = endIndex - startIndex + 1;
        this.thoughtHistory.splice(startIndex - 1, removedCount, summaryThought);

        // Renumber subsequent thoughts
        for (let i = startIndex; i < this.thoughtHistory.length; i++) {
            this.thoughtHistory[i].thoughtNumber -= (removedCount - 1);
        }

        // Rebuild branches (simplification: clear and let it rebuild if needed, or just clear)
        this.branches = {};
        this.thoughtHistory.forEach(t => {
            if (t.branchFromThought && t.branchId) {
                const branchKey = `${t.branchFromThought}-${t.branchId}`;
                if (!this.branches[branchKey]) this.branches[branchKey] = [];
                this.branches[branchKey].push(t);
            }
        });

        await this.saveHistory();
        return {
            newHistoryLength: this.thoughtHistory.length,
            summaryInsertedAt: startIndex
        };
    }

    private addToMemory(input: ThoughtData) {
        if (input.thoughtNumber > input.totalThoughts) {
            input.totalThoughts = input.thoughtNumber;
        }
        
        this.thoughtHistory.push(input);
        
        if (input.branchFromThought && input.branchId) {
            const branchKey = `${input.branchFromThought}-${input.branchId}`;
            if (!this.branches[branchKey]) {
                this.branches[branchKey] = [];
            }
            this.branches[branchKey].push(input);
        }
    }

    private formatThought(thoughtData: ThoughtData): string {
        const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId, thoughtType, score, options, selectedOption } = thoughtData;
        
        let prefix = '';
        let context = '';
        
        if (thoughtType === 'reflexion' || isRevision) {
            prefix = chalk.yellow('🔄 Reflexion');
            if (revisesThought) context += ` (revising thought ${revisesThought})`;
        } else if (thoughtType === 'generation') {
             prefix = chalk.magenta('💡 Generation');
        } else if (thoughtType === 'evaluation') {
             prefix = chalk.cyan('⚖️ Evaluation');
             if (score) context += ` (Score: ${score})`;
        } else if (thoughtType === 'selection') {
             prefix = chalk.green('✅ Selection');
             if (selectedOption) context += ` (Selected: ${selectedOption})`;
        } else if (branchFromThought) {
            prefix = chalk.green('🌿 Branch');
            context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
        } else {
            prefix = chalk.blue('💭 Thought');
            context = '';
        }

        const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
        const borderLength = Math.max(header.length, thought.length) + 4;
        const border = '─'.repeat(borderLength);
        
        let extraContent = '';
        if (options && options.length > 0) {
            extraContent += `
│ Options:
` + options.map(o => `│ - ${o}`).join('\n');
        }

        return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(borderLength - 2)} │${extraContent}
└${border}┘`;
    }

    public async processThought(input: ThoughtData): Promise<{ content: any[], isError?: boolean }> {
        try {
            if (this.delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, this.delayMs));
            }
            this.addToMemory(input);
            await this.saveHistory();
            
            if (!this.disableThoughtLogging) {
                const formattedThought = this.formatThought(input);
                console.error(formattedThought);
            }
            
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            thoughtNumber: input.thoughtNumber,
                            totalThoughts: input.totalThoughts,
                            nextThoughtNeeded: input.nextThoughtNeeded,
                            branches: Object.keys(this.branches),
                            thoughtHistoryLength: this.thoughtHistory.length
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error),
                            status: 'failed'
                        }, null, 2)
                    }],
                isError: true
            };
        }
    }
}