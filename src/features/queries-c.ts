/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export = `
(struct_specifier
	name: (type_identifier) @struct.name
) @struct

(union_specifier
	name: (type_identifier) @struct.name
) @struct

(enum_specifier
	name: (type_identifier) @enum.name
) @enum

(enumerator
	name: (identifier) @enumMember.name
) @enumMember

(function_declarator
	declarator: (identifier) @function.name
) @function

;; todo@jrieken the struct-name is matched after its children and therefore not associated properly
(type_definition
	type: (_)
	declarator: (type_identifier) @struct.name
) @struct

(linkage_specification
	value: (string_literal) @struct.name
) @struct

(field_declaration_list
	(field_declaration
		[
			declarator: (field_identifier) @field.name
			(array_declarator
				declarator: (field_identifier) @field.name
			)
		]
	) @field
)`;