/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUMap } from "./util/lruMap";
import Parser from '../../tree-sitter/tree-sitter';
import { Disposable } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentStore, TextDocumentChange2 } from './documentStore';
import { asTsPoint } from "./common";


class Entry {
	constructor(
		public version: number,
		public tree: Parser.Tree,
		public edits: Parser.Edit[][]
	) { }
}

export class Trees {

	private readonly _cache = new LRUMap<string, Entry>({
		size: 100,
		dispose(entries) {
			for (let [, value] of entries) {
				value.tree.delete();
			}
		}
	});

	private readonly _languages = new Map<string, { wasmUri: string, language?: Promise<Parser.Language> }>();

	private readonly _listener: Disposable[] = [];
	private readonly _parser = new Parser();

	constructor(private readonly _documents: DocumentStore, languages: { languageId: string, wasmUri: string }[]) {

		// supported languages
		for (let item of languages) {
			this._languages.set(item.languageId, { wasmUri: item.wasmUri });
		}

		// build edits when document changes
		this._listener.push(_documents.onDidChangeContent2(e => {
			const info = this._cache.get(e.document.uri);
			if (info) {
				info.edits.push(Trees._asEdits(e));
			}
		}));
	}

	dispose(): void {
		this._parser.delete();
		for (let item of this._cache.values()) {
			item.tree.delete();
		}
		for (let item of this._listener) {
			item.dispose();
		}
	}

	// --- languages

	private async _getLanguage(langId: string): Promise<Parser.Language | undefined> {
		const entry = this._languages.get(langId);
		if (!entry) {
			return undefined;
		}
		if (!entry.language) {
			entry.language = Parser.Language.load(entry.wasmUri);

		}
		return entry.language;
	}

	// --- tree/parse

	async getParseTree(documentOrUri: TextDocument | string): Promise<Parser.Tree> {

		if (typeof documentOrUri === 'string') {
			documentOrUri = await this._documents.retrieve(documentOrUri);
		}

		const language = await this._getLanguage(documentOrUri.languageId);
		if (!language) {
			throw new Error(`UNKNOWN languages ${documentOrUri.languageId}`);
		}

		let info = this._cache.get(documentOrUri.uri);
		if (info?.version === documentOrUri.version) {
			return info.tree;
		}

		this._parser.setLanguage(language);
		try {
			const version = documentOrUri.version;
			const text = documentOrUri.getText();
			this._parser.setTimeoutMicros(1000 * 1000); // parse max 1sec

			if (!info) {
				// never seen before, parse fresh
				const tree = this._parser.parse(text);
				info = new Entry(version, tree, []);
				this._cache.set(documentOrUri.uri, info);

			} else {
				// existing entry, apply deltas and parse incremental
				const oldTree = info.tree;
				const deltas = info.edits.flat();
				deltas.forEach(delta => oldTree.edit(delta));
				info.edits.length = 0;

				info.tree = this._parser.parse(text, oldTree);
				info.version = version;
				oldTree.delete();
			}

			return info.tree;

		} catch (e) {
			this._cache.delete(documentOrUri.uri);
			throw e;
		}
	}

	private static _asEdits(event: TextDocumentChange2): Parser.Edit[] {
		return event.changes.map(change => ({
			startPosition: asTsPoint(change.range.start),
			oldEndPosition: asTsPoint(change.range.end),
			newEndPosition: asTsPoint(event.document.positionAt(change.rangeOffset + change.text.length)),
			startIndex: change.rangeOffset,
			oldEndIndex: change.rangeOffset + change.rangeLength,
			newEndIndex: change.rangeOffset + change.text.length
		}));
	}
};