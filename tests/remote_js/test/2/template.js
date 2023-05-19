const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('Tests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
	});
});
