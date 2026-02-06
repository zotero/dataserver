/**
 * API helper class for Zotero API v2 testing
 * Port of include/api2.inc.php
 *
 * Key differences from api3.js:
 * - Items POST uses { "items": [...] } wrapper
 * - Collections POST uses { "collections": [...] } wrapper
 * - Searches POST uses { "searches": [...] } wrapper
 * - Default response format is 'atom' instead of 'json'
 * - Authentication uses ?key= query parameter instead of Bearer token
 */

import config from 'config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { assert200 } from './assertions3.js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { xpathSelect } from './xpath.js';
import { assert } from 'chai';

let __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

/**
 * Simple response wrapper to provide consistent interface
 */
class APIResponse {
	constructor(response, body) {
		this._response = response;
		this._body = body;
		this._status = response.status;
		this._headers = response.headers;
	}

	getStatus() {
		return this._status;
	}

	getBody() {
		return this._body;
	}

	getHeader(name) {
		return this._headers.get(name);
	}
}

class API2 {
	static apiVersion = 2;
	static schemaVersion = false;
	static apiKey = false;

	// Generate a valid Zotero key (8 characters from allowed set)
	static generateKey() {
		let chars = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
		let key = '';
		for (let i = 0; i < 8; i++) {
			key += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return key;
	}

	// Alias for generateKey() to match PHP API
	static getKey() {
		return this.generateKey();
	}

	static useAPIVersion(version) {
		this.apiVersion = version;
	}

	static useSchemaVersion(version) {
		this.schemaVersion = version;
	}

	static resetSchemaVersion() {
		let schemaPath = path.resolve(__dirname, '../htdocs/zotero-schema/schema.json');
		let schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
		this.schemaVersion = schema.version;
	}

	static useAPIKey(key = '') {
		this.apiKey = key;
	}

	// Build headers object for requests (API v2 style - no Bearer token)
	static _buildHeaders(additionalHeaders = [], auth = false) {
		let headers = {};

		if (this.apiVersion) {
			headers['Zotero-API-Version'] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers['Zotero-Schema-Version'] = this.schemaVersion;
		}
		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headers['Authorization'] = `Basic ${credentials}`;
		}

		// Parse additional headers (format: "Header-Name: value")
		for (let header of additionalHeaders) {
			let colonIndex = header.indexOf(':');
			if (colonIndex > 0) {
				let name = header.substring(0, colonIndex).trim();
				let value = header.substring(colonIndex + 1).trim();
				headers[name] = value;
			}
		}

		return headers;
	}

	// Core fetch wrapper
	static async _fetch(method, url, options = {}) {
		let { headers = {}, body, auth, redirect = 'manual' } = options;

		let fetchOptions = {
			method,
			headers: { ...headers },
			redirect: redirect
		};

		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			fetchOptions.headers['Authorization'] = `Basic ${credentials}`;
		}

		if (body !== undefined) {
			fetchOptions.body = body;
		}

		if (config.get('verbose') >= 1) {
			console.log(`\n${method} ${url}`);
		}

		let response = await fetch(url, fetchOptions);
		let responseBody = await response.text();

		if (config.get('verbose') >= 2) {
			console.log(`\n${responseBody}\n`);
		}

		return new APIResponse(response, responseBody);
	}

	// HTTP methods
	static async get(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('GET', fullUrl, { headers: builtHeaders, auth });
	}

	static async superGet(url, headers = []) {
		return this.get(url, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}

	static async userGet(userID, suffix, headers = [], auth = false) {
		return this.get(`users/${userID}/${suffix}`, headers, auth);
	}

	static async groupGet(groupID, suffix, headers = [], auth = false) {
		return this.get(`groups/${groupID}/${suffix}`, headers, auth);
	}

	static async post(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('POST', fullUrl, { headers: builtHeaders, body: data, auth });
	}

	static async superPost(url, data, headers = []) {
		return this.post(url, data, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}

	static async userPost(userID, suffix, data, headers = [], auth = false) {
		return this.post(`users/${userID}/${suffix}`, data, headers, auth);
	}

	static async groupPost(groupID, suffix, data, headers = [], auth = false) {
		return this.post(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async put(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('PUT', fullUrl, { headers: builtHeaders, body: data, auth });
	}

	static async superPut(url, data, headers = []) {
		return this.put(url, data, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}

	static async userPut(userID, suffix, data, headers = [], auth = false) {
		return this.put(`users/${userID}/${suffix}`, data, headers, auth);
	}

	static async groupPut(groupID, suffix, data, headers = [], auth = false) {
		return this.put(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async patch(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('PATCH', fullUrl, { headers: builtHeaders, body: data, auth });
	}

	static async userPatch(userID, suffix, data, headers = []) {
		return this.patch(`users/${userID}/${suffix}`, data, headers);
	}

	static async head(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('HEAD', fullUrl, { headers: builtHeaders, auth });
	}

	static async userHead(userID, suffix, headers = [], auth = false) {
		return this.head(`users/${userID}/${suffix}`, headers, auth);
	}

	static async delete(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('DELETE', fullUrl, { headers: builtHeaders, auth });
	}

	static async superDelete(url, headers = []) {
		return this.delete(url, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}

	static async userDelete(userID, suffix, headers = [], auth = false) {
		return this.delete(`users/${userID}/${suffix}`, headers, auth);
	}

	static async groupDelete(groupID, suffix, headers = [], auth = false) {
		return this.delete(`groups/${groupID}/${suffix}`, headers, auth);
	}

	// User/Group clear methods
	static async userClear(userID) {
		let response = await this.userPost(
			userID,
			'clear',
			'',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Error clearing user ${userID}`);
		}
	}

	static async groupClear(groupID) {
		let response = await this.groupPost(
			groupID,
			'clear',
			'',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Error clearing group ${groupID}`);
		}
	}

	// Item template and creation methods
	static async getItemTemplate(itemType) {
		let response = await this.get(`items/new?itemType=${itemType}`);
		if (response.getStatus() !== 200) {
			console.log(response.getStatus());
			console.log(response.getBody());
			throw new Error('Invalid response from template request');
		}
		return JSON.parse(response.getBody());
	}

	// API v2 uses { "items": [...] } wrapper
	static async createItem(itemType, data = {}, returnFormat = 'atom') {
		let json = await this.getItemTemplate(itemType);

		if (data) {
			for (let [field, val] of Object.entries(data)) {
				json[field] = val;
			}
		}

		let response = await this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('item', response, returnFormat);
	}

	// POST a JSON item object (API v2 format with wrapper)
	static async postItem(json) {
		return this.postItems([json]);
	}

	// POST JSON items (API v2 format with wrapper)
	static async postItems(json) {
		return this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: json
			}),
			['Content-Type: application/json']
		);
	}

	static getPluralObjectType(objectType) {
		if (objectType === 'search') {
			return objectType + 'es';
		}
		return objectType + 's';
	}

	// Note creation (API v2 format)
	static async createNoteItem(text = '', parentKey = false, returnFormat = 'atom') {
		let response = await this.get('items/new?itemType=note');
		let json = JSON.parse(response.getBody());
		json.note = text;
		if (parentKey) {
			json.parentItem = parentKey;
		}

		let postResponse = await this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({ items: [json] }),
			['Content-Type: application/json']
		);
		return this.handleCreateResponse('item', postResponse, returnFormat);
	}

	// Attachment creation (API v2 format)
	static async createAttachmentItem(linkMode, data = {}, parentKey = false, returnFormat = 'atom') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.getBody());
		for (let [key, val] of Object.entries(data)) {
			json[key] = val;
		}
		if (parentKey) {
			json.parentItem = parentKey;
		}

		let postResponse = await this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({ items: [json] }),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('item', postResponse, returnFormat);
	}

	// Collection creation (API v2 format with wrapper)
	static async createCollection(name, data = {}, returnFormat = 'atom') {
		let parent = false;
		let relations = {};

		if (data && typeof data === 'object') {
			parent = data.parentCollection || false;
			relations = data.relations || {};
		}
		else if (data) {
			parent = data;
		}

		let json = {
			collections: [
				{
					name: name,
					parentCollection: parent,
					relations: relations
				}
			]
		};

		let response = await this.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('collection', response, returnFormat);
	}

	// Search creation (API v2 format with wrapper)
	static async createSearch(name, conditions = [], returnFormat = 'atom') {
		if (!conditions || conditions === 'default') {
			conditions = [{
				condition: 'title',
				operator: 'contains',
				value: 'test'
			}];
		}

		let json = {
			searches: [
				{
					name: name,
					conditions: conditions
				}
			]
		};

		let response = await this.userPost(
			config.get('userID'),
			`searches?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('search', response, returnFormat);
	}

	// Group item creation
	static async groupCreateItem(groupID, itemType, data = {}, returnFormat = 'atom') {
		let json = await this.getItemTemplate(itemType);

		if (data) {
			for (let [field, val] of Object.entries(data)) {
				json[field] = val;
			}
		}

		let response = await this.groupPost(
			groupID,
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({ items: [json] }),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('item', response, returnFormat, groupID);
	}

	// Get methods
	static async getItem(keys, format = false, groupID = false) {
		return this.getObject('item', keys, format, groupID);
	}

	static async getItemResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('item', keys, format, groupID);
	}

	static async getCollection(keys, format = false, groupID = false) {
		return this.getObject('collection', keys, format, groupID);
	}

	static async getCollectionResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('collection', keys, format, groupID);
	}

	static async getSearch(keys, format = false, groupID = false) {
		return this.getObject('search', keys, format, groupID);
	}

	static async getSearchResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('search', keys, format, groupID);
	}

	static async getObject(objectType, keys, format = false, groupID = false) {
		let response = await this.getObjectResponse(objectType, keys, format, groupID);
		let contentType = response.getHeader('Content-Type');

		switch (contentType) {
			case 'application/json':
				return this.getJSONFromResponse(response);
			case 'application/atom+xml':
				return this.getXMLFromResponse(response);
			default:
				console.log(response.getBody());
				throw new Error(`Unknown content type '${contentType}'`);
		}
	}

	static async getObjectResponse(objectType, keys, format = false, groupID = false) {
		let objectTypePlural = this.getPluralObjectType(objectType);
		let single = typeof keys === 'string';

		let url = objectTypePlural;
		if (single) {
			url += `/${keys}`;
		}
		url += `?key=${config.get('apiKey')}`;
		if (!single) {
			url += `&${objectType}Key=${keys.join(',')}&order=${objectType}KeyList`;
		}
		if (format !== false) {
			url += `&format=${format}`;
			if (format === 'atom') {
				url += '&content=json';
			}
		}

		let response;
		if (groupID) {
			response = await this.groupGet(groupID, url);
		}
		else {
			response = await this.userGet(config.get('userID'), url);
		}

		assert200(response);
		return response;
	}

	static async getItemXML(keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		let response = await this.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&itemKey=${keys.join(',')}&order=itemKeyList&content=json`,
			[],
			false
		);
		assert200(response);
		return this.getXMLFromResponse(response);
	}

	static async getCollectionXML(keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		let response = await this.userGet(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}&collectionKey=${keys.join(',')}&order=collectionKeyList&content=json`,
			[],
			false
		);
		assert200(response);
		return this.getXMLFromResponse(response);
	}

	static async getSearchXML(keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		let response = await this.userGet(
			config.get('userID'),
			`searches?key=${config.get('apiKey')}&searchKey=${keys.join(',')}&order=searchKeyList&content=json`,
			[],
			false
		);
		assert200(response);
		return this.getXMLFromResponse(response);
	}

	static async groupGetItemXML(groupID, keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		let response = await this.groupGet(
			groupID,
			`items?key=${config.get('apiKey')}&itemKey=${keys.join(',')}&order=itemKeyList&content=json`,
			[],
			false
		);
		assert200(response);
		return this.getXMLFromResponse(response);
	}

	// Response parsing
	static getJSONFromResponse(response, _asObject = false) {
		let json = JSON.parse(response.getBody());
		if (json === null) {
			console.log(response.getBody());
			throw new Error('JSON response could not be parsed');
		}
		return json;
	}

	static getXMLFromResponse(response) {
		let parser = new DOMParser();
		let xml = parser.parseFromString(response.getBody(), 'text/xml');
		if (!xml) {
			console.log(response.getBody());
			throw new Error('XML response could not be parsed');
		}
		return xml;
	}

	static parseDataFromAtomEntry(entryXML) {
		let keyNode = xpathSelect(entryXML, '//atom:entry/zapi:key/text()', true);
		let versionNode = xpathSelect(entryXML, '//atom:entry/zapi:version/text()', true);
		let contentNode = xpathSelect(entryXML, '//atom:entry/atom:content', true);

		if (!contentNode) {
			throw new Error('Atom response does not contain <content>');
		}

		let content;
		// If 'content' contains XML elements, serialize the whole <content> element (like PHP's asXML())
		let hasElementChildren = false;
		for (let i = 0; i < contentNode.childNodes.length; i++) {
			if (contentNode.childNodes[i].nodeType === 1) { // Element node
				hasElementChildren = true;
				break;
			}
		}
		if (hasElementChildren) {
			content = contentNode.toString();
		}
		else {
			content = contentNode.textContent || '';
		}

		return {
			key: keyNode ? keyNode.nodeValue : '',
			version: versionNode ? versionNode.nodeValue : '',
			content: content
		};
	}

	static getContentFromResponse(response) {
		let xml = this.getXMLFromResponse(response);
		let data = this.parseDataFromAtomEntry(xml);
		return data.content;
	}

	static getFirstSuccessKeyFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		if (!json.success || json.success.length === 0) {
			console.log(response.getBody());
			throw new Error('No success keys found in response');
		}
		return json.success[0];
	}

	static getSuccessfulKeysFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		return json.successful.map(o => o.key);
	}

	// Library version
	static async getLibraryVersion() {
		let response = await this.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&limit=1`
		);
		return parseInt(response.getHeader('Last-Modified-Version'));
	}

	static async getGroupLibraryVersion(groupID) {
		let response = await this.groupGet(
			groupID,
			`items?key=${config.get('apiKey')}&format=keys&limit=1`
		);
		return parseInt(response.getHeader('Last-Modified-Version'));
	}

	// Key permission methods
	static async setKeyOption(userID, key, option, val) {
		// Fetch current key settings (XML format in API v2)
		let response = await this.get(
			`users/${userID}/keys/${key}`,
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 200) {
			console.log(response.getBody());
			throw new Error(`GET returned ${response.getStatus()}`);
		}

		// Parse XML response
		let parser = new DOMParser();
		let xml = parser.parseFromString(response.getBody(), 'text/xml');

		// Find access elements with library attribute and update them
		let accessElements = xml.getElementsByTagName('access');
		let needsUpdate = false;

		for (let i = 0; i < accessElements.length; i++) {
			let access = accessElements[i];
			if (!access.hasAttribute('library')) {
				continue;
			}

			let attrName;
			switch (option) {
				case 'libraryNotes':
					attrName = 'notes';
					break;
				case 'libraryWrite':
					attrName = 'write';
					break;
				default:
					continue;
			}

			let current = parseInt(access.getAttribute(attrName) || '0');
			if (current !== val) {
				access.setAttribute(attrName, val);
				needsUpdate = true;
			}
		}

		if (needsUpdate) {
			let serializer = new XMLSerializer();
			let xmlStr = serializer.serializeToString(xml);

			let putResponse = await this.put(
				`users/${config.get('userID')}/keys/${config.get('apiKey')}`,
				xmlStr,
				[],
				{
					username: config.get('rootUsername'),
					password: config.get('rootPassword')
				}
			);
			if (putResponse.getStatus() !== 200) {
				console.log(putResponse.getBody());
				throw new Error(`PUT returned ${putResponse.getStatus()}`);
			}
		}
	}

	// Group creation/management
	static async createGroup(fields, returnFormat = 'id') {
		// Build XML for group creation
		let xml = '<group';
		xml += ` owner="${fields.owner}"`;
		xml += ` name="${fields.name || 'Test Group ' + Date.now()}"`;
		xml += ` type="${fields.type}"`;
		xml += ` libraryEditing="${fields.libraryEditing || 'members'}"`;
		xml += ` libraryReading="${fields.libraryReading || 'members'}"`;
		xml += ` fileEditing="${fields.fileEditing || 'none'}"`;
		xml += ' description=""';
		xml += ' url=""';
		xml += ' hasImage="0"';
		xml += '/>';

		let response = await this.superPost('groups', xml);
		if (response.getStatus() !== 201) {
			console.log(response.getBody());
			throw new Error(`Unexpected response code ${response.getStatus()}`);
		}

		let url = response.getHeader('Location');
		let match = url.match(/[0-9]+$/);
		let groupID = parseInt(match[0]);

		// Add members
		if (fields.members && fields.members.length > 0) {
			let membersXml = '';
			for (let member of fields.members) {
				membersXml += `<user id="${member}" role="member"/>`;
			}
			let usersResponse = await this.superPost(`groups/${groupID}/users`, membersXml);
			if (usersResponse.getStatus() !== 200) {
				console.log(usersResponse.getBody());
				throw new Error(`Unexpected response code ${usersResponse.getStatus()}`);
			}
		}

		if (returnFormat === 'response') {
			return response;
		}
		if (returnFormat === 'id') {
			return groupID;
		}
		throw new Error(`Unknown response format '${returnFormat}'`);
	}

	static async deleteGroup(groupID) {
		let response = await this.superDelete(`groups/${groupID}`);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Unexpected response code ${response.getStatus()}`);
		}
	}

	// Handle create response (API v2 style - default to atom)
	static async handleCreateResponse(objectType, response, returnFormat, groupID = false) {
		let uctype = objectType.charAt(0).toUpperCase() + objectType.slice(1);

		assert200(response);

		if (returnFormat === 'response') {
			return response;
		}

		let json = this.getJSONFromResponse(response);

		if (returnFormat !== 'responsejson' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error(`${uctype} creation failed`);
		}

		if (returnFormat === 'responsejson') {
			return json;
		}

		let key = json.success[0];

		if (returnFormat === 'key') {
			return key;
		}

		// Get XML for atom/data/content/json formats
		let xml;
		if (objectType === 'item') {
			if (groupID) {
				xml = await this.groupGetItemXML(groupID, key);
			}
			else {
				xml = await this.getItemXML(key);
			}
		}
		else if (objectType === 'collection') {
			xml = await this.getCollectionXML(key);
		}
		else if (objectType === 'search') {
			xml = await this.getSearchXML(key);
		}

		if (returnFormat === 'atom') {
			return xml;
		}

		let data = this.parseDataFromAtomEntry(xml);

		if (returnFormat === 'data') {
			return data;
		}
		if (returnFormat === 'content') {
			return data.content;
		}
		if (returnFormat === 'json') {
			return JSON.parse(data.content);
		}

		throw new Error(`Invalid result format '${returnFormat}'`);
	}

	// Compare two XML strings for semantic equality (like PHPUnit's assertXmlStringEqualsXmlString)
	static assertXmlStringEqualsXmlString(expected, actual) {
		let parser = new DOMParser();
		let expectedDoc = parser.parseFromString(expected, 'text/xml');
		let actualDoc = parser.parseFromString(actual, 'text/xml');

		// Normalize both by serializing and re-parsing
		let serializer = new XMLSerializer();
		let expectedStr = serializer.serializeToString(expectedDoc);
		let actualStr = serializer.serializeToString(actualDoc);

		// Normalize whitespace between tags
		expectedStr = expectedStr.replace(/>\s+</g, '><').trim();
		actualStr = actualStr.replace(/>\s+</g, '><').trim();

		assert.equal(actualStr, expectedStr, `XML strings do not match.\nExpected:\n${expected}\n\nActual:\n${actual}`);
	}
}

export { API2 as API };
