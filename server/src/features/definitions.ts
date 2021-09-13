/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import { DocumentStore } from '../documentStore';
import { SymbolIndex } from './symbolIndex';
import { Trees } from '../trees';
import { FileInfo } from './fileInfo';

export class DefinitionProvider {

	constructor(
		private readonly _documents: DocumentStore,
		private readonly _trees: Trees,
		private readonly _symbols: SymbolIndex
	) { }

	register(connection: lsp.Connection) {
		connection.onDefinition(this.provideDefinitions.bind(this));
	}

	async provideDefinitions(params: lsp.DefinitionParams): Promise<lsp.Location[]> {
		const document = await this._documents.retrieve(params.textDocument.uri);

		const info = FileInfo.detailed(document, this._trees);
		const scope = info.root.findScope(params.position);
		const anchor = scope.findAnchor(params.position);
		if (!anchor) {
			return [];
		}

		// find definition inside this file
		const definitions = scope.findDefinitions(anchor.name);
		if (definitions.length > 0) {
			return definitions.map(def => lsp.Location.create(document.uri, def.range));
		}

		// find definition globally
		await this._symbols.update();
		const result: lsp.Location[] = [];
		const all = this._symbols.definitions.get(anchor.name);
		if (all) {
			for (const symbol of all) {
				result.push(symbol.location);
			}
		}
		return result;
	}
}
