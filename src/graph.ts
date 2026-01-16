import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript';

export interface FileNode {
    path: string;
    imports: string[];
    importedBy: string[];
    symbols: string[]; // Exported functions/classes
}

export class ProjectKnowledgeGraph {
    private nodes: Map<string, FileNode> = new Map();
    private rootDir: string = '';

    constructor() {}

    async build(rootDir: string) {
        this.rootDir = path.resolve(rootDir);
        this.nodes.clear();

        const files = await this.getAllFiles(this.rootDir);
        
        // Step 1: Initialize nodes
        for (const file of files) {
            this.nodes.set(file, {
                path: file,
                imports: [],
                importedBy: [],
                symbols: []
            });
        }

        // Step 2: Parse imports and build edges
        for (const file of files) {
            await this.parseFile(file);
        }

        return {
            nodeCount: this.nodes.size,
            totalFiles: files.length
        };
    }

    private async getAllFiles(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const res = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
                files.push(...await this.getAllFiles(res));
            } else {
                if (/\.(ts|js|tsx|jsx|json)$/.test(entry.name)) {
                    files.push(res);
                }
            }
        }
        return files;
    }

    private async parseFile(filePath: string) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true
            );

            const imports: string[] = [];
            const symbols: string[] = [];

            const visit = (node: ts.Node) => {
                // --- Symbols (Exports) ---
                if (ts.isFunctionDeclaration(node) && node.name) {
                    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (isExported) symbols.push(`function:${node.name.text}`);
                } else if (ts.isClassDeclaration(node) && node.name) {
                    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (isExported) symbols.push(`class:${node.name.text}`);
                } else if (ts.isVariableStatement(node)) {
                    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (isExported) {
                        node.declarationList.declarations.forEach(d => {
                            if (ts.isIdentifier(d.name)) symbols.push(`var:${d.name.text}`);
                        });
                    }
                }

                // --- Imports ---
                if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
                    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                        imports.push(node.moduleSpecifier.text);
                    }
                }
                // 2. Dynamic imports: import('...')
                else if (ts.isCallExpression(node)) {
                    if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
                        const arg = node.arguments[0];
                        if (ts.isStringLiteral(arg)) {
                            imports.push(arg.text);
                        }
                    }
                    // 3. CommonJS: require('...')
                    else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
                        const arg = node.arguments[0];
                        if (ts.isStringLiteral(arg)) {
                            imports.push(arg.text);
                        }
                    }
                }
                ts.forEachChild(node, visit);
            };

            visit(sourceFile);

            const currentNode = this.nodes.get(filePath);
            if (!currentNode) return;

            currentNode.symbols = symbols;

            for (const importPath of imports) {
                let resolvedPath: string | null = null;

                if (importPath.startsWith('.')) {
                    resolvedPath = await this.resolvePath(path.dirname(filePath), importPath);
                } else {
                    resolvedPath = await this.resolvePath(this.rootDir, importPath);
                }

                if (resolvedPath && this.nodes.has(resolvedPath)) {
                    if (!currentNode.imports.includes(resolvedPath)) {
                        currentNode.imports.push(resolvedPath);
                    }
                    if (!this.nodes.get(resolvedPath)?.importedBy.includes(filePath)) {
                        this.nodes.get(resolvedPath)?.importedBy.push(filePath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing file ${filePath}:`, error);
        }
    }

    private async resolvePath(dir: string, relativePath: string): Promise<string | null> {
        const absolutePath = path.resolve(dir, relativePath);
        
        // 1. Try exact match
        if (this.nodes.has(absolutePath)) {
            return absolutePath;
        }

        // 2. Try appending extensions
        const extensions = ['.ts', '.js', '.tsx', '.jsx', '.json', '/index.ts', '/index.js'];
        for (const ext of extensions) {
            const p = absolutePath + ext;
            if (this.nodes.has(p)) {
                return p;
            }
        }

        // 3. Try handling .js -> .ts mapping (ESM style imports)
        if (absolutePath.endsWith('.js')) {
            const tsPath = absolutePath.replace(/\.js$/, '.ts');
            if (this.nodes.has(tsPath)) return tsPath;
            
            const tsxPath = absolutePath.replace(/\.js$/, '.tsx');
            if (this.nodes.has(tsxPath)) return tsxPath;

            const jsxPath = absolutePath.replace(/\.js$/, '.jsx');
            if (this.nodes.has(jsxPath)) return jsxPath;
        }

        return null;
    }

    public getRelationships(filePath: string) {
        const absolutePath = path.resolve(this.rootDir, filePath);
        // Try to match exact or with extensions
        let node = this.nodes.get(absolutePath);
        
        if (!node) {
             // Fallback search
             for (const [key, value] of this.nodes.entries()) {
                 if (key.endsWith(filePath)) {
                     node = value;
                     break;
                 }
             }
        }

        if (!node) return null;

        return {
            path: node.path,
            imports: node.imports.map(p => path.relative(this.rootDir, p)),
            importedBy: node.importedBy.map(p => path.relative(this.rootDir, p)),
            symbols: node.symbols
        };
    }

    public getSummary() {
        return {
            root: this.rootDir,
            fileCount: this.nodes.size,
            mostReferencedFiles: [...this.nodes.values()]
                .sort((a, b) => b.importedBy.length - a.importedBy.length)
                .slice(0, 5)
                .map(n => ({
                    file: path.relative(this.rootDir, n.path),
                    referencedBy: n.importedBy.length
                }))
        };
    }
}
