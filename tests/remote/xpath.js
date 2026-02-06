import xpath from 'xpath';

let select = xpath.useNamespaces({
	atom: 'http://www.w3.org/2005/Atom',
	zapi: 'http://zotero.org/ns/api',
	zxfer: 'http://zotero.org/ns/transfer'
});

function xpathSelect(xml, expression, single = false) {
	return select(expression, xml, single);
}

export { xpathSelect };
